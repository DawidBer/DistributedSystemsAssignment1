import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate"; 

const translateClient = new TranslateClient({ region: process.env.REGION }); 
const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const pathParameters = event.pathParameters;

  if (!pathParameters) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "path is required" }),
    };
  }

  const parameters  = event?.pathParameters;
  const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
  const language = event.queryStringParameters?.language;

  if (!language) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Language is required" }),
    };
  }

  try {
    // Fetch the movie from DynamoDB
    const getItemCommand = new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { id: movieId },
    });

    const getItemResult = await ddbDocClient.send(getItemCommand);

    if (!getItemResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Movie not found" }),
      };
    }

    const movie = getItemResult.Item;
    const translations = movie.translations || {};

    if (translations[language]) {
      return {
        statusCode: 200,
        body: JSON.stringify({ data: movie }),
      };
    }

    const translatedAttributes = await translateAttributes(movie, language);
    const updateItemCommand = new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { id: movieId },
      UpdateExpression: 'SET translations = :translations',
      ExpressionAttributeValues: {
        ':translations': { ...translations, [language]: translatedAttributes },
      },
    });
    await ddbDocClient.send(updateItemCommand);

    return {
      statusCode: 200,
      body: JSON.stringify({ data: { ...movie, translations: { ...translations, [language]: translatedAttributes } } }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    };
  }
};

async function translateAttributes(movie: any, language: string) {
  const translatedAttributes: any = {};

  for (const [key, value] of Object.entries(movie)) {
    if (typeof value === 'string' && key !== 'translations') {
      const translatedValue = await translateText(value, language);
      translatedAttributes[key] = translatedValue;
    }
  }
  return translatedAttributes;
}

async function translateText(text: string, targetLanguage: string) {
  const params = {
    Text: text,
    SourceLanguageCode: 'auto',
    TargetLanguageCode: targetLanguage,
  };

  try {
    // Using SDK v3 TranslateClient to call the translateText method
    const command = new TranslateTextCommand(params);
    const result = await translateClient.send(command);
    return result.TranslatedText;
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error("Error translating text");
  }
}

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = { wrapNumbers: false };
  return DynamoDBDocumentClient.from(ddbClient, { marshallOptions, unmarshallOptions });
}
