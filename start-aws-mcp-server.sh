#!/bin/bash

# Set environment variables
export AWS_REGION=us-east-1
export AWS_API_MCP_READ_ONLY=true

# Run the AWS API MCP server using uvx with --from flag for faster startup
exec uvx --from awslabs.aws-api-mcp-server awslabs-aws-api-mcp-server