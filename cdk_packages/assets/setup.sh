#!/bin/bash
# log UserData script output, source: https://alestic.com/2010/12/ec2-user-data-output/
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1
echo -----
echo ----- start UserData script
echo -----

echo ----- update system -----

apt-get update
apt-get upgrade -y
apt-get install unzip -y
apt-get install jq -y

echo ----- install AWS CLI -----

apt-get install awscli -y
aws --version

echo ----- install Node.js 16 -----

# see also: https://github.com/nodesource/distributions

apt-get update
apt-get install -y ca-certificates curl gnupg
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
NODE_MAJOR=16
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install nodejs -y

echo ----- install docker -----

# Add Docker's official GPG key:
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

# install docker
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# test docker
sudo docker run hello-world

echo ----- install restart script -----

TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
region=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/document | jq --raw-output .region)

s3_object_url=$(eval 'aws ssm get-parameters --region '"$region"' --names /Wickr-GenAI-Chatbot/wickr-io-start-script --query '"'"'Parameters[0].Value'"'"' --output text')
aws s3 cp "$s3_object_url" /start_wickrio.sh
chmod +x /start_wickrio.sh
echo "@reboot /start_wickrio.sh" >> /var/spool/cron/crontabs/root
chmod 600 /var/spool/cron/crontabs/root
./start_wickrio.sh

echo -----
echo ----- end UserData script
echo -----
