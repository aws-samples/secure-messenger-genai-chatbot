import {GetParameterCommand, SSMClient} from "@aws-sdk/client-ssm";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";


const GRAPHQL_PARAMETER = "/Wickr-GenAI-Chatbot/chatbot-graphql-api-definition";
const COGNITO_USER_PARAMETER = "/Wickr-GenAI-Chatbot/wickr-io-cognito-config"
const COGNITO_USER_SECRET = "WickrIO-Cognito-User-Password";

const region = process.env.AWS_REGION;

async function getGraphqlApiDefinition() {
    const client = new SSMClient({region: region});
    const response = await client.send(
        new GetParameterCommand({Name: GRAPHQL_PARAMETER})
    );
    return JSON.parse(response.Parameter.Value);
}

async function getCognitoUser() {
    const secretsManagerClient = new SecretsManagerClient({region: region});
    const ssmClient = new SSMClient({region: region});
    let response;
    response = await ssmClient.send(
        new GetParameterCommand({Name: COGNITO_USER_PARAMETER})
    );
    const userPoolWebClientId = JSON.parse(response.Parameter.Value).user_pool_web_client_id;
    const userId = JSON.parse(response.Parameter.Value).user_id;
    response = await secretsManagerClient.send(
        new GetSecretValueCommand({SecretId: COGNITO_USER_SECRET})
    );
    const pwd = response.SecretString;
    return {userPoolWebClientId: userPoolWebClientId, user: userId, password: pwd};
}

export {getGraphqlApiDefinition, getCognitoUser};
