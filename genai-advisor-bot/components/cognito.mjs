import {CognitoIdentityProviderClient, InitiateAuthCommand} from "@aws-sdk/client-cognito-identity-provider";

const region = process.env.AWS_REGION;

async function authenticateUser(user) {
    const client = new CognitoIdentityProviderClient(
        {region: region}
    );
    const initiateAuthCommand = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: user.userPoolWebClientId,
        AuthParameters: {
            USERNAME: user.user,
            PASSWORD: user.password
        }
    });
    try {
        return await client.send(initiateAuthCommand);
    } catch (error) {
        console.error("Error authenticating user:", error);
        throw error;
    }
}

async function getIdToken(cognitoUser) {
    const authResult = await authenticateUser(cognitoUser);
    return authResult.AuthenticationResult.IdToken;
}

export {getIdToken};
