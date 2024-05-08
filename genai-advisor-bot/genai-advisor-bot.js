// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const WickrIOAPI = require('wickrio_addon');
const WickrIOBotAPI = require('wickrio-bot-api');
const util = require('util')
const logger = require('wickrio-bot-api').logger
const {GetSecretValueCommand, SecretsManagerClient} = require('@aws-sdk/client-secrets-manager');
const {CognitoIdentityProviderClient, InitiateAuthCommand} = require('@aws-sdk/client-cognito-identity-provider');
const {SSMClient, GetParameterCommand} = require('@aws-sdk/client-ssm');
const {DynamoDBClient} = require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient, ScanCommand} = require('@aws-sdk/lib-dynamodb');
const WebSocket = require('ws');

console.log = function () {
    logger.info(util.format.apply(null, arguments))
}
console.error = function () {
    logger.error(util.format.apply(null, arguments))
}

const fs = require('fs');
const path = require('path');


module.exports = WickrIOAPI;
process.stdin.resume(); // so the program will not close instantly

let clientCognito = new CognitoIdentityProviderClient();
let clientSecretsManager = new SecretsManagerClient({region: process.env.AWS_REGION});
let clientSSM = new SSMClient();
let client = new DynamoDBClient({});
let docClient = DynamoDBDocumentClient.from(client);

let bot;
let webSocket;
let chatbotWebsocketEndpoint;
let chatbotAccessToken;
let chatbotModelRag;


//catches ctrl+c and stop.sh events
process.on('SIGINT', exitHandler.bind(null, {
    exit: true
}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {
    pid: true
}));
process.on('SIGUSR2', exitHandler.bind(null, {
    pid: true
}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {
    exit: true
}));

async function exitHandler(options, err) {
    try {
        if (err) {
            logger.error('Exit error:', err);
            process.exit();
        }
        const closed = await bot.close();
        logger.log(closed);
        if (options.exit) {
            process.exit();
        } else if (options.pid) {
            process.kill(process.pid);
        }
    } catch (err) {
        logger.error(err);
    }
}


async function openWebsocket() {
    logger.info('entered openWebsocket()');
    return new Promise((resolve, reject) => {
        webSocket = new WebSocket(`${chatbotWebsocketEndpoint}/socket/?token=` + chatbotAccessToken);
        webSocket.onopen = (event) => {
            logger.info('webSocket.onopen - websocket is open.');
            resolve(webSocket);
        };
        webSocket.onerror = (error) => {
            logger.error(`webSocketOnError() - error = ${JSON.stringify(error, null, 4)}`);
            reject(error);
        };
        webSocket.onclose = (event) => {
            logger.warning('webSocket.onclose - websocket closed.');
        };
        webSocket.onmessage = (event) => {
            webSocketOnMessage(event);
        };
    });
}


function webSocketOnMessage(event) {
    logger.info('entered webSocketOnMessage()');
    const response = JSON.parse(event.data);
    logger.info(`response.data.sessionId = ${response.data.sessionId}`);
    WickrIOAPI.cmdSendRoomMessage(response.data.sessionId, response.data.content.trim());
    logger.info('Response received from AWS GenAI chatbot sent to Wickr client.');
}


async function startWickrIoBot() {
    logger.info('entered startWickrIoBot()');
    try {
        var status;
        if (process.argv[2] === undefined) {
            var bot_username = fs.readFileSync('client_bot_username.txt', 'utf-8');
            bot_username = bot_username.trim();
            bot = new WickrIOBotAPI.WickrIOBot();
            status = await bot.start(bot_username)
        } else {
            bot = new WickrIOBotAPI.WickrIOBot();
            status = await bot.start(process.argv[2])
        }
        if (!status) {
            exitHandler(null, {
                exit: true,
                reason: 'Client not able to start.'
            });
        }
        await bot.startListening(listen); // passes a callback function that will receive incoming messages into the bot client
    } catch (err) {
        logger.error(err);
    }
}


async function getModelRagParams() {
    logger.info('entered getModelRagParams()');

    // Get LLM model and RAG parameters from SSM Parameter Store.
    let response = await clientSSM.send(
        new GetParameterCommand({
                Name: '/Wickr-GenAI-Chatbot/model-rag-params',
            }
        )
    );
    chatbotModelRag = JSON.parse(response.Parameter.Value);

    // Get the workspace ID from DynamoDB.
    const params = {
        TableName: chatbotModelRag.rag_workspaces_table_name,
        FilterExpression: '#name = :rag_workspace_name',
        ExpressionAttributeNames: {'#name': 'name'},
        ExpressionAttributeValues: {
            ':rag_workspace_name': chatbotModelRag.rag_workspace_name,
        },
        ProjectionExpression: 'workspace_id, #name',
    };
    try {
        const response = await docClient.send(new ScanCommand(params));
        chatbotModelRag.rag_workspace_id = response.Items[0].workspace_id;
    } catch (err) {
        logger.error(err);
    }

    logger.info(
        `Bot will use model "${chatbotModelRag.model_name}" and RAG workspace "${chatbotModelRag.rag_workspace_name}"`
    );
}


async function loginCognitoUser() {
    logger.info('entered loginCognitoUser()');
    let response;
    // Get bot user ID and password from ParameterStore and Secrets Manager.
    response = await clientSSM.send(
        new GetParameterCommand({
                Name: '/Wickr-GenAI-Chatbot/wickr-io-cognito-config',
            }
        )
    );
    const user = JSON.parse(response.Parameter.Value);
    response = await clientSecretsManager.send(
        new GetSecretValueCommand({SecretId: 'WickrIO-Cognito-User-Password'}),
    );
    const passwd = response.SecretString.toString();

    // Login to Cognito user pool.
    response = await clientCognito.send(
        new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: user.user_pool_web_client_id,
            AuthParameters: {
                USERNAME: user.user_id,
                PASSWORD: passwd,
            }
        })
    );
    if (response.AuthenticationResult.AccessToken) {
        logger.info(`Bot Cognito user logged in successfully with user ID "${user.user_id}".`);
    } else {
        logger.error(`Bot Cognito user login failed with user ID "${user.user_id}".`);
    }

    chatbotWebsocketEndpoint = user.chat_bot_websocket_endpoint;
    chatbotAccessToken = response.AuthenticationResult.AccessToken;
    const interval = response.AuthenticationResult.ExpiresIn * 1000 * 0.95;
    logger.info(`Bot Cognito user access token will expire in ${response.AuthenticationResult.ExpiresIn} seconds`);
    setTimeout(
        refreshCognitoAccessToken, interval,
        interval, user.user_pool_web_client_id, response.AuthenticationResult.RefreshToken
    );
}


async function refreshCognitoAccessToken(interval, userPoolWebClientId, refreshToken) {
    logger.info('entered refreshCognitoAccessToken()');
    const response = await clientCognito.send(
        new InitiateAuthCommand({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: userPoolWebClientId,
            AuthParameters: {
                REFRESH_TOKEN: refreshToken,
            }
        })
    )

    if (response.AuthenticationResult.AccessToken) {
        logger.info('Cognito bot user access token refreshed successfully.');
        chatbotAccessToken = response.AuthenticationResult.AccessToken;
        interval = response.AuthenticationResult.ExpiresIn * 1000 * 0.95;
        logger.info(`Access token expires in = ${response.AuthenticationResult.ExpiresIn} seconds`);
        setTimeout(
            refreshCognitoAccessToken, interval,
            interval, userPoolWebClientId, refreshToken
        );
    } else {
        logger.error('Cognito bot user access token refresh failed.');
    }
}


async function listen(rMessage) { // starts a listener. Message payload accessible as 'message'
    logger.info('entered listen()')
    var parsedMessage = bot.parseMessage(rMessage);
    var userEmail = parsedMessage.userEmail;
    var vGroupID = parsedMessage.vgroupid;
    var userArr = [];
    userArr.push(userEmail);
    if (parsedMessage.message) {
        // for testing purposes do an echo, just sent the same message back
        // logger.info('for testing purposes do an echo, just sent the same message back');
        // logger.info(`parsedMessage.message = ${parsedMessage.message}`);
        // logger.info(`vGroupID = ${vGroupID}`);
        // const resp = await WickrIOAPI.cmdSendRoomMessage(vGroupID, parsedMessage.message);
        // logger.info(`resp = ${JSON.stringify(resp)}`);
        await sendMessageToGenAiChatbot(parsedMessage.message, vGroupID)
    }
}

module.exports.listen = listen;

async function sendMessageToGenAiChatbot(message, vGroupID) {
    logger.info('entered sendMessageToGenAiChatbot()')
    logger.info(`vGroupID = ${vGroupID}`)
    const msg = JSON.stringify({
        'action': 'run',
        'modelInterface': 'langchain',
        'data': {
            'mode': 'chain',
            'text': message,
            'files': [],
            'modelName': chatbotModelRag.model_name,
            'provider': 'sagemaker',
            'sessionId': vGroupID,
            'workspaceId': chatbotModelRag.rag_workspace_id,
            'modelKwargs': {
                'streaming': true,
                'maxTokens': 512,
                'temperature': 0.6,
                'topP': 0.9
            }
        }
    });
    if (webSocket.readyState !== WebSocket.OPEN) {
        logger.info('Websocket is not open. Reopening ...');
        await openWebsocket();
    }
    if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(msg);
        logger.info('Message sent to AWS GenAI chatbot websocket API.')
    } else {
        logger.error('Websocket is not open.');
    }
}


async function main() { // entry point
    logger.info('entered main()');
    try {
        await getModelRagParams();
        await loginCognitoUser();
        await openWebsocket();
        await startWickrIoBot();
    } catch (err) {
        logger.error(err);
    }
}

module.exports.main = main;

main().then();
