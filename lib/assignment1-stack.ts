import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from "../shared/util";
import {movies, movieCasts} from "../seed/movies";
import * as apig from "aws-cdk-lib/aws-apigateway";
import { Aws } from "aws-cdk-lib";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Construct } from 'constructs';
import * as iam from "aws-cdk-lib/aws-iam";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import { AuthApi } from './auth-api'
import { AppApi } from './app-api'


export class Assignment1Stack extends cdk.Stack {
  // private auth: apig.IResource;
  // private userPoolId: string;
  // private userPoolClientId: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //Authenticate
    const userPool = new UserPool(this, "UserPool", {
      signInAliases: { username: true, email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolId = userPool.userPoolId;

    const appClient = userPool.addClient("AppClient", {
      authFlows: { userPassword: true },
    });

    const userPoolClientId = appClient.userPoolClientId;

    new AuthApi(this, 'AuthServiceApi', {
      userPoolId: userPoolId,
      userPoolClientId: userPoolClientId,
    });

    new AppApi(this, 'aaappApi', {
      userPoolId: userPoolId,
      userPoolClientId: userPoolClientId,
    });
  
    //Authenticate

    //Tables
    const moviesTable = new dynamodb.Table(this, "MoviesTable", {  //Movies tables in dynamodb aws
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Movies",
    });

    const movieCastsTable = new dynamodb.Table(this, "MovieCastTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "actorName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "MovieCast",
    });

    movieCastsTable.addLocalSecondaryIndex({
      indexName: "roleIx",
      sortKey: { name: "roleName", type: dynamodb.AttributeType.STRING },
    });

    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [moviesTable.tableName]: generateBatch(movies),
            [movieCastsTable.tableName]: generateBatch(movieCasts),  // Added
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [moviesTable.tableArn, movieCastsTable.tableArn],  // Includes movie cast
      }),
    });

    //Functions
    const getMovieByIdFn = new lambdanode.NodejsFunction(
      this,
      "GetMovieByIdFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/getMovieById.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: moviesTable.tableName,
          CAST_TABLE_NAME: movieCastsTable.tableName,
          REGION: 'eu-west-1',
        },
      }
    );

    const getAllMoviesFn = new lambdanode.NodejsFunction(
      this,
      "GetAllMoviesFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/getAllMovies.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: moviesTable.tableName,
          REGION: 'eu-west-1',
        },
      }
      );

      const getMovieCastMemberFn = new lambdanode.NodejsFunction(
        this,
        "GetCastMemberFn",
        {
          architecture: lambda.Architecture.ARM_64,
          runtime: lambda.Runtime.NODEJS_16_X,
          entry: `${__dirname}/../lambdas/getMovieCastMember.ts`,
          timeout: cdk.Duration.seconds(10),
          memorySize: 128,
          environment: {
            TABLE_NAME: movieCastsTable.tableName,
            REGION: "eu-west-1",
          },
        }
      );
        
        //add movie
        const newMovieFn = new lambdanode.NodejsFunction(this, "AddMovieFn", {
          architecture: lambda.Architecture.ARM_64,
          runtime: lambda.Runtime.NODEJS_16_X,
          entry: `${__dirname}/../lambdas/addMovie.ts`,
          timeout: cdk.Duration.seconds(10),
          memorySize: 128,
          environment: {
            TABLE_NAME: moviesTable.tableName,
            REGION: "eu-west-1",
          },
        });

        //delete movie
        const deleteMovieFn = new lambdanode.NodejsFunction(this, "DeleteMovieFn", {
          architecture: lambda.Architecture.ARM_64,
          runtime: lambda.Runtime.NODEJS_18_X,
          entry: `${__dirname}/../lambdas/deleteMovie.ts`,
          timeout: cdk.Duration.seconds(10),
          memorySize: 128,
          environment: {
            TABLE_NAME: moviesTable.tableName,
            REGION: "eu-west-1",
          },
        });


        //translate
        const translateFn = new lambdanode.NodejsFunction(this, "TranslateMovieFn", {
          architecture: lambda.Architecture.ARM_64,
          runtime: lambda.Runtime.NODEJS_16_X,
          entry: `${__dirname}/../lambdas/translate.ts`,
          timeout: cdk.Duration.seconds(10),
          memorySize: 128,
          environment: {
            TABLE_NAME: moviesTable.tableName,
            REGION: "eu-west-1",
          },
        });

        //edit movie
        const editMovieFn = new lambdanode.NodejsFunction(this, "EditMovieFn", {
          architecture: lambda.Architecture.ARM_64,
          runtime: lambda.Runtime.NODEJS_16_X,
          entry: `${__dirname}/../lambdas/editMovie.ts`,
          timeout: cdk.Duration.seconds(10),
          memorySize: 128,
          environment: {
            TABLE_NAME: moviesTable.tableName,
            REGION: "eu-west-1",
          },
        });


        //permissions
    moviesTable.grantReadData(getMovieByIdFn)
    moviesTable.grantReadData(getAllMoviesFn)
    moviesTable.grantReadWriteData(newMovieFn)
    moviesTable.grantReadWriteData(deleteMovieFn)
    movieCastsTable.grantReadData(getMovieCastMemberFn)
    movieCastsTable.grantReadData(getMovieByIdFn)
    moviesTable.grantReadWriteData(editMovieFn)
    moviesTable.grantReadWriteData(translateFn)
    translateFn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: [
        "translate:TranslateText",
        "comprehend:DetectDominantLanguage"
      ],
      resources: ["*"],
    }))

    //Rest API
    const api = new apig.RestApi(this, "RestAPI", {
      description: "Assignment api",
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });

    const appApi = new apig.RestApi(this, "AppApi", {
      description: "App RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });
    

    const appCommonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: userPoolId,
        CLIENT_ID: userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };

    const protectedFn = new node.NodejsFunction(this, "ProtectedFn", {
      ...appCommonFnProps,
      entry: "./lambdas/protected.ts",
    });

    const publicFn = new node.NodejsFunction(this, "PublicFn", {
      ...appCommonFnProps,
      entry: "./lambdas/public.ts",
    });

    const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: "./lambdas/auth/authorizer.ts",
    });
    
    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      "RequestAuthorizer",
      {
        identitySources: [apig.IdentitySource.header("cookie")],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      }
    );

    //get all movies
    const moviesEndpoint = api.root.addResource("movies");
    moviesEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getAllMoviesFn, { proxy: true })
    );

    //Get movie by id
    const movieEndpoint = moviesEndpoint.addResource("{movieId}");
    movieEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieByIdFn, { proxy: true })
    );

    //Get movie cast
    const movieCastEndpoint = moviesEndpoint.addResource("cast");
    movieCastEndpoint.addMethod(
    "GET",
    new apig.LambdaIntegration(getMovieCastMemberFn, { proxy: true })
    );

    //add movie post
    moviesEndpoint.addMethod("POST", new apig.LambdaIntegration(newMovieFn), { 
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      });

    //delete movie
    moviesEndpoint.addMethod(
      "DELETE",
      new apig.LambdaIntegration(deleteMovieFn, { proxy: true })
    );

    //edit movie
    moviesEndpoint.addMethod(
      "PUT",
      new apig.LambdaIntegration(editMovieFn), {
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      });

    //Get translate movie
    const translationEndpoint = movieEndpoint.addResource("translate");
    translationEndpoint.addMethod(
    "GET",
    new apig.LambdaIntegration(translateFn, { proxy: true })
    );

    //url outputs in terminal
    // new cdk.CfnOutput(this, "Get Movie by id function Url", { value: getMovieByIdURL.url });
    // new cdk.CfnOutput(this, "Get Movies list Function Url", { value: getAllMoviesURL.url });
    // new cdk.CfnOutput(this, "Get Movie Cast members url", { value: getMovieCastMemberURL.url });
  }
}