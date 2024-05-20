#!/bin/bash
# log UserData script output, source: https://alestic.com/2010/12/ec2-user-data-output/
exec > >(tee /var/log/start_wickrio.log | logger -t start_wickrio -s 2>/dev/console) 2>&1
echo -----
echo ----- start UserData script
echo -----

echo ----- update system -----

apt-get update
apt-get upgrade -y

echo ----- get EC2 meta data -----

TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
region=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/document | jq --raw-output .region)

echo ----- deploy Wickr IO integration code -----

s3_object_url=$(eval 'aws ssm get-parameters --region '"$region"' --names /Wickr-GenAI-Chatbot/wickr-io-integration-code --query '"'"'Parameters[0].Value'"'"' --output text')
wickr_io_bot_user_id=$(eval 'aws ssm get-parameters --region '"$region"' --names /Wickr-GenAI-Chatbot/wickr-io-bot-user-id --query '"'"'Parameters[0].Value'"'"' --output text')
s3_bucket_name=$(grep -oP "(?<=s3://).+(?=/)" <<< "$s3_object_url")
temp_dir=$(eval mktemp -d)
aws s3 cp "$s3_object_url" software.tar.gz
# The tar.gz needs to be extracted and tar zipped again under the root user that will run the docker container.
# Without this "repackaging" the Wickr IO integration will fail with an error like this:
# "CONSOLE:Failed to run /opt/WickrIO/clients/genai-advisor-bot/integration/genai-advisor-bot/install.sh"
# This is caused by the file owner within the tar.gz file not being root. In addition, execution permissions
# need to be set to allow *.sh and .js to be executed.
tar -xf software.tar.gz -C "$temp_dir"
cd "$temp_dir" || exit
chmod +x *.js *.sh
tar -czvf software.tar.gz *
aws s3 cp software.tar.gz "s3://$s3_bucket_name/wickrio-integrations/$wickr_io_bot_user_id/software.tar.gz"
cd /

echo ----- configure AWS credentials -----

# configure AWS access key and secret key
mkdir -p .aws
AWS_ACCESS_KEY_ID=$(eval "aws secretsmanager get-secret-value --region $region --secret-id WickrIO-IAM-User-Secret | jq --raw-output .SecretString | jq --raw-output .aws_access_key_id")
AWS_SECRET_ACCESS_KEY=$(eval "aws secretsmanager get-secret-value --region $region --secret-id WickrIO-IAM-User-Secret | jq --raw-output .SecretString | jq --raw-output .aws_secret_access_key")
echo "[default]" > .aws/credentials
echo "aws_access_key_id = $AWS_ACCESS_KEY_ID" >> .aws/credentials
echo "aws_secret_access_key = $AWS_SECRET_ACCESS_KEY" >> .aws/credentials
echo "[default]" > .aws/config
echo "current directory:"
pwd
echo "content of .aws :"
ls -la .aws

echo ----- configure and start Wickr IO container -----

# pull and start the wickr container
mkdir -p opt
mkdir -p opt/WickrIO
#WICKR_IO_CONTAINER="public.ecr.aws/x3s2s6k3/wickrio/bot-cloud-pre:6.32.03.05"  # pre-prod as of 2024-02-06
#WICKR_IO_CONTAINER="public.ecr.aws/x3s2s6k3/wickrio/bot-cloud:6.24.06.02"
#WICKR_IO_CONTAINER="public.ecr.aws/x3s2s6k3/wickrio/bot-cloud:latest"
WICKR_IO_CONTAINER="wickr/bot-cloud:latest"
docker pull $WICKR_IO_CONTAINER
AWS_SECRET_NAME=$(eval "aws secretsmanager get-secret-value --region $region --secret-id WickrIO-Config | jq --raw-output .ARN")
docker stop WickrIOGenAIAssistant && docker remove WickrIOGenAIAssistant
docker run \
    -e "AWS_SECRET_NAME=$AWS_SECRET_NAME" \
    -e "AWS_DEFAULT_REGION=$region" \
    -e "AWS_REGION=$region" \
    -e "AWS_S3_INTEGRATIONS_REGION=$region" \
    -e "AWS_S3_INTEGRATIONS_BUCKET=$s3_bucket_name" \
    -e "AWS_S3_INTEGRATIONS_FOLDER=wickrio-integrations" \
    -v /.aws:/home/wickriouser/.aws \
    -v /opt/WickrIO:/opt/WickrIO \
    -d --restart=always --name="WickrIOGenAIAssistant" -ti $WICKR_IO_CONTAINER

echo -----
echo ----- end UserData script
echo -----
