import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from "../shared/util";
import {movies, movieCasts} from "../seed/movies";

import { Construct } from 'constructs';

export class Assignment1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //Tables

    const moviesTable = new dynamodb.Table(this, "MoviesTable", {  //Movies tables in dynamodb aws
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Movies",
    });

    const movieCastsTable = new dynamodb.Table(this, "MovieCastTable", { //Movie Cast Table
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


    //Functions

    // const simpleFn = new lambdanode.NodejsFunction(this, "SimpleFn", {
    //   architecture: lambda.Architecture.ARM_64,
    //   runtime: lambda.Runtime.NODEJS_18_X,
    //   entry: `${__dirname}/../lambdas/simple.ts`,
    //   timeout: cdk.Duration.seconds(10),
    //   memorySize: 128,
    // });

    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [moviesTable.tableName]: generateBatch(movies),
            [movieCastsTable.tableName]: generateBatch(movieCasts),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [moviesTable.tableArn, movieCastsTable.tableArn],
      }),
    });

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

      const getMovieCastMembersFn = new lambdanode.NodejsFunction(
        this,
        "GetCastMemberFn",
       {
          architecture: lambda.Architecture.ARM_64,
          runtime: lambda.Runtime.NODEJS_16_X,
          entry: `${__dirname}/../lambdas/getMovieCastMembers.ts`,
          timeout: cdk.Duration.seconds(10),
          memorySize: 128,
          environment: {
            CAST_TABLE_NAME: movieCastsTable.tableName,
            REGION: "eu-west-1",
           },
         }
        );

    //URL Functions
    const getMovieByIdURL = getMovieByIdFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
      },
    });

    const getAllMoviesURL = getAllMoviesFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
      },
    });

    const getMovieCastMembersURL = getMovieCastMembersFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
 },
 });  

    //permissions
    moviesTable.grantReadData(getMovieByIdFn)
    moviesTable.grantReadData(getAllMoviesFn)
    movieCastsTable.grantReadData(getMovieCastMembersFn)

    //url outputs in terminal
    new cdk.CfnOutput(this, "Get Movie Function Url", { value: getMovieByIdURL.url });
    new cdk.CfnOutput(this, "Get Movies list Function Url", { value: getAllMoviesURL.url });
    new cdk.CfnOutput(this, "Get Movie Cast members url", { value: getMovieCastMembersURL.url });


  }
}