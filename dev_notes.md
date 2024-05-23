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
You can now connect to the EC2 instance via SSH from your local workstation using `localhost:5555`.

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
    -e "AWS_REGION=$region" \
    -e "AWS_S3_INTEGRATIONS_REGION=$region" \
    -e "AWS_S3_INTEGRATIONS_BUCKET=$s3_bucket_name" \
    -e "AWS_S3_INTEGRATIONS_FOLDER=wickrio-integrations" \
    -v /.aws:/home/wickriouser/.aws \
    -v /opt/WickrIO:/opt/WickrIO \
    -d --name="WickrIOGenAIAssistant" -ti $WICKR_IO_CONTAINER && docker attach WickrIOGenAIAssistant
```

Detach from running Wickr container: `control + p` then `control + q`.

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

Get shell into the running WickrIO container:
```shell
docker exec -it WickrIOGenAIAssistant bash
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
