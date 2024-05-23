#!/usr/bin/env python3


from aws_cdk import (
    aws_ec2 as ec2,
)
from constructs import Construct


class SSHEnablement(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        # create security group rule for inbound SSH but no outbound rule
        ssh_sg = ec2.SecurityGroup(
            self, "SSH security group",
            vpc=params.network.vpc,
            description="SSH security group",
        )
        ssh_sg.add_ingress_rule(
            ec2.Peer.security_group_id(params.ec2_instance_connection_endpoint.ec2ice_sg.security_group_id),
            ec2.Port.tcp(22),
            description='allow SSH access from EC2 Instance Connection Endpoint',
        )

        # add security group to EC2 instance
        params.wickrio_instance.ec2_instance.add_security_group(ssh_sg)

        # add SSH key to EC2 instance
        params.wickrio_instance.ec2_instance.instance.add_property_override('KeyName', 'ec2-ssh-access-eu-west-1')
