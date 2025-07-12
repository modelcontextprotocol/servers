#!/usr/bin/env python3

import boto3
import argparse
import sys

def test_cross_account_access(account_id, role_name):
    """
    Test cross-account access to CloudWatch logs
    
    Args:
        account_id (str): AWS account ID to access
        role_name (str): IAM role name with necessary permissions
    """
    print(f"Testing cross-account access to account {account_id} using role {role_name}")
    
    try:
        # Step 1: Get current AWS identity
        sts_client = boto3.client('sts')
        current_identity = sts_client.get_caller_identity()
        print(f"Current identity: {current_identity}")
        
        # Step 2: Construct role ARN
        role_arn = f"arn:aws:iam::{account_id}:role/{role_name}"
        print(f"Attempting to assume role: {role_arn}")
        
        # Step 3: Attempt to assume the role
        try:
            assumed_role = sts_client.assume_role(
                RoleArn=role_arn,
                RoleSessionName="TestCrossAccountSession"
            )
            
            # Extract temporary credentials
            credentials = assumed_role['Credentials']
            print("Successfully assumed role")
            
            # Step 4: Create CloudWatch Logs client with assumed credentials
            logs_client = boto3.client(
                'logs',
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )
            
            # Step 5: Test listing log groups
            print("Testing listing log groups...")
            response = logs_client.describe_log_groups(limit=5)
            
            # Print the results
            log_groups = response.get('logGroups', [])
            print(f"Successfully retrieved {len(log_groups)} log groups:")
            for i, group in enumerate(log_groups):
                print(f"  {i+1}. {group.get('logGroupName')}")
                
            print("\nCross-account access test successful!")
            return True
            
        except sts_client.exceptions.ClientError as e:
            print(f"Failed to assume role: {e}")
            print("\nPossible causes:")
            print("1. The role may not exist in the target account")
            print("2. The role may not have a trust relationship with your account")
            print("3. The role name may be incorrect")
            print("\nSuggested trust policy for the role:")
            source_account = current_identity['Account']
            print(f"""
{{
    "Version": "2012-10-17",
    "Statement": [
        {{
            "Effect": "Allow",
            "Principal": {{
                "AWS": "arn:aws:iam::{source_account}:root"
            }},
            "Action": "sts:AssumeRole"
        }}
    ]
}}
""")
            return False
            
    except Exception as e:
        print(f"Error: {e}")
        return False
        
def main():
    parser = argparse.ArgumentParser(description='Test AWS cross-account access')
    parser.add_argument('--account-id', required=True, help='Target AWS account ID')
    parser.add_argument('--role-name', required=True, help='Role name to assume in target account')
    
    args = parser.parse_args()
    
    success = test_cross_account_access(args.account_id, args.role_name)
    
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()