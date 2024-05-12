# Development notes

This document contains a loose collection of notes, command line examples and code snippets. The purpose of this
document is to help during development and troubleshooting by serving as a quick references and to aid copy and 
paste of often used commands.

## Remote access to EC2 instance

Connect to the console of the EC2 instance that runs the WickrIO container via SSM Session Manager (EC2 AWS console).
Alternatively deploy with `EC2InstanceConnectEndpoint` and `SSHEnablement` constructs. Then open a tunnel 
via Instance Connection Endpoint:
```shell
aws ec2-instance-connect open-tunnel --instance-id insertEC2instanceIDhere --remote-port 22 --local-port 5555
```
You can now connect to the EC2 instance via SSH using `localhost:5555`.

## Troubleshooting the WickrIO start process

Restart Wickr docker container:
```shell
docker restart WickrIOGenAIAssistant
```

Stop and remove the running container:
```shell
docker stop WickrIOGenAIAssistant
docker remove WickrIOGenAIAssistant
```

Set required variables:
```shell
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
region=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/document | jq --raw-output .region)
s3_object_url=$(eval 'aws ssm get-parameters --region '"$region"' --names /Wickr-GenAI-Chatbot/wickr-io-integration-code --query '"'"'Parameters[0].Value'"'"' --output text')
s3_bucket_name=$(grep -oP "(?<=s3://).+(?=/)" <<< "$s3_object_url")
wickr_io_bot_user_id=$(eval 'aws ssm get-parameters --region '"$region"' --names /Wickr-GenAI-Chatbot/wickr-io-bot-user-id --query '"'"'Parameters[0].Value'"'"' --output text')
AWS_SECRET_NAME=$(eval "aws secretsmanager get-secret-value --region $region --secret-id WickrIO-Config | jq --raw-output .ARN")
WICKR_IO_CONTAINER="wickr/bot-cloud:latest"
```

Start container and attach to it:
```shell
docker run \
    -e "AWS_SECRET_NAME=$AWS_SECRET_NAME" \
    -e "AWS_DEFAULT_REGION=$region" \
    -e "AWS_S3_INTEGRATIONS_REGION=$region" \
    -e "AWS_S3_INTEGRATIONS_BUCKET=$s3_bucket_name" \
    -e "AWS_S3_INTEGRATIONS_FOLDER=wickrio-integrations" \
    -v /.aws:/home/wickriouser/.aws \
    -v /opt/WickrIO:/opt/WickrIO \
    -d --name="WickrIOGenAIAssistant" -ti $WICKR_IO_CONTAINER && docker attach WickrIOGenAIAssistant
```

Turn on debug messages in the WickrIO container. Run `debug on` after attaching to the WickrIO container console. 
You may want to repeat the start procedure after turning debug messages on.

Lookout for error messages during startup.

Check the Wickr IO integration log directory
```shell
sudo su
cd /opt/WickrIO/clients/<wickr bot user ID>/integration/<wickr bot user ID>/
tail -f wpm2.output
```


The following is an example for an incorrect configured Wickr client account - aka "bot" account (see also [Create Wickr IO client account](./README.md#create-wickr-io-client-account)):
```shell
...
Begin register existing user context.

Validation Error

Failed to create or login new user!

 wickr-genai-advisor-bot does not seem to exist. Please verify in the Admin Console.!
 "Load client config failed! Failed to get client values and configure for wickr-genai-advisor-bot"
Finished initializing the config files!
...
```

Here is an example where the Wickr client account - aka "bot" account has been provided with incorrect password:
```shell
...
Creating user:  "genai-advisor-2-bot"

Begin registration with password.

Begin register new user context.

Begin register existing user context.

Either the username or password you entered was invalid.

Failed to create or login new user!

 User genai-advisor-2-bot exists already, password entered seems to be invalid!
 "Load client config failed! Failed to get client values and configure for genai-advisor-2-bot"
Finished initializing the config files!
...
```

An empty column "Integration" from the list command indicates a failed installation of the integration code from S3.
```shell
...
Current list of clients:
#  Name                       Status   Integration  Version  Events  Misc
===============================================================================
0  wickr-genai-advisor-3-bot  Running                        1
...
```

## Various general commands

Create Python requirements.txt from code repository:
```shell
pipreqs . --ignore .venv,.idea,node_modules --force
```

Install AWS CLI within the Wickr IO container for debugging (e.g. check identity with which the Wickr IO bot 
accesses AWS services by running `aws sts get-caller-identity`):
```shell
apt-get install unzip
apt-get install less
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
export AWS_CONFIG_FILE=/home/wickriouser/.aws/config
export AWS_SHARED_CREDENTIALS_FILE=/home/wickriouser/.aws/credentials
```

Get secret from SSM Secrets Manager:
```shell
aws secretsmanager get-secret-value --secret-id WickrIO-Config --region eu-west-1
```

Assume EC2 instance role:
```shell
aws sts assume-role --role-arn arn:aws:iam::123456789012:role/ec2-instance-role --role-session-name instance-role-session 
```

List running docker containers:
```shell
docker container list
```

Clear Wickr IO configuration and start Wickr IO container with no configuration (requires manual configuration 
after attaching to the container):
```shell
rm -rf /opt/WickrIO/
mkdir -p opt
mkdir -p opt/WickrIO
WICKR_IO_CONTAINER="wickr/bot-cloud:latest"
docker pull $WICKR_IO_CONTAINER
docker run \
    -v /.aws:/.aws \
    -v /opt/WickrIO:/opt/WickrIO \
    -d --name="WickrIOGenAIAssistant" -ti $WICKR_IO_CONTAINER
```

Stop and remove Wickr docker container:
```shell
docker stop WickrIOGenAIAssistant && docker remove WickrIOGenAIAssistant
```

Attach to running Wickr container:
```shell
docker attach WickrIOGenAIAssistant
```

Detach from running Wickr container: `control + p` then `control + q`.

Get shell into running container:
```shell
docker exec -it WickrIOGenAIAssistant bash
```

Check the content of software.tar.gz file:
```shell
aws s3 cp "s3://$s3_bucket_name/wickrio-integrations/genai-advisor-bot/software.tar.gz" software.tar.gz
tar -tvf software.tar.gz
```

## Interacting with the AWS GenAI Chatbot API

Project [Deploying a Multi-Model and Multi-RAG Powered Chatbot Using AWS CDK on AWS](https://github.com/aws-samples/aws-genai-llm-chatbot).

Function that handles incoming messages: 
`aws-genai-llm-chatbot\lib\chatbot-api\functions\incoming-message-handler\index.py`

Websocket API endpoint is configured as an environment variable: `WEBSOCKET_API_ENDPOINT`

Connect to websockt via wscat tool, get access token from CloudWatch log outputs:
```shell
wscat -c "wss://8ilmxet0ak.execute-api.eu-west-1.amazonaws.com/socket/?token=<access token received with successful login to Cognito user pool.>"
```

Sample send message to communicate with chatbot websocket:
```json
{
  "action": "run",
  "modelInterface": "langchain",
  "data": {
    "mode": "chain",
    "text": "What are symptoms of lung cancer according to NICE?",
    "files": [],
    "modelName": "meta-LLama2-13b-chat",
    "provider": "sagemaker",
    "sessionId": "d89f9d9f-c316-4383-a8c4-38a3068b4983",
    "workspaceId": "cefa1fd1-33ed-4749-841a-0a6cfcbb2676",
    "modelKwargs": {
      "streaming": true,
      "maxTokens": 512,
      "temperature": 0.6,
      "topP": 0.9
    }
  }
}
```

```
Flattened structure:
```json
{  "action": "run",  "modelInterface": "langchain",  "data": {    "mode": "chain",    "text": "In the context of cyber security, how is key rotation increasing security?",    "files": [],    "modelName": "meta-LLama2-13b-chat",    "provider": "sagemaker",    "sessionId": "a8c1eff0-7dfd-4801-8e2b-7b022e2d7630",    "workspaceId": "",    "modelKwargs": {      "streaming": true,      "maxTokens": 512,      "temperature": 0.6,      "topP": 0.9    }  }}
```

Sample response JSON:
```json
{
  "type": "text",
  "action": "final_response",
  "connectionId": "PW13PelEDoECHsw=",
  "timestamp": "1701590848",
  "userId": "3789279f-54bf-408f-b66e-0da637fecd62",
  "data": {
    "sessionId": "a8c1eff0-7dfd-4801-8e2b-7b022e2d7630",
    "type": "text",
    "content": " Sure, I'd be happy to help! In the context of cyber security, key rotation is a technique used to increase security by periodically changing the encryption keys used to protect data.\n\nBy regularly changing the encryption keys, key rotation helps to prevent attackers from using stolen or compromised keys to access sensitive information. This is especially important in situations where an attacker has gained unauthorized access to a system or network, as it limits the amount of time they have to use the stolen keys to access sensitive data.\n\nAdditionally, key rotation can help to prevent attacks that rely on the use of static keys, such as replay attacks, where an attacker attempts to use a stolen key to access a system or network multiple times. By regularly changing the encryption keys, key rotation can help to prevent these types of attacks and increase the overall security of a system or network.\n\nI hope that helps! Do you have any other questions about key rotation or cyber security?",
    "metadata": {
      "modelId": "meta-LLama2-13b-chat",
      "modelKwargs": {
        "streaming": true,
        "maxTokens": 512,
        "temperature": 0.6,
        "topP": 0.9
      },
      "mode": "chain",
      "sessionId": "a8c1eff0-7dfd-4801-8e2b-7b022e2d7630",
      "userId": "3789279f-54bf-408f-b66e-0da637fecd62",
      "documents": []
    }
  },
  "direction": "OUT"
}
```

## Query DynamoDB

Find entry in DynamoDB table for given RAG workspace name:
```shell
aws dynamodb scan `
    --table-name "GenAIChatBotStack-RagEnginesRagDynamoDBTablesWorkspacesD2D3C0C4-1NEBFDOQVNV0K" `
    --filter-expression "#name = :rag_workspace_name" `
    --expression-attribute-names '{"#name": "name"}' `
    --expression-attribute-values '{":rag_workspace_name": {"S": "WickrIO-Bot-Advisor"}}' `
    --projection-expression "workspace_id, #name"
```
