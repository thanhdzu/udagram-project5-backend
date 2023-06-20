import * as AWS from 'aws-sdk'
import { DocumentClient, Key  } from 'aws-sdk/clients/dynamodb'
import { createLogger } from '../utils/logger'
import { TodoItem, PageableTodoItems  } from '../models/TodoItem'
import { TodoUpdate } from '../models/TodoUpdate'
const AWSXRay = require('aws-xray-sdk')
const XAWS = AWSXRay.captureAWS(AWS)
const logger = createLogger('TodosAccess')

// TODO: Implement the dataLayer logic
export class TodosAccess {
  constructor(
    private readonly docClient: DocumentClient = new XAWS.DynamoDB.DocumentClient(),
    private readonly todosTable = process.env.TODOS_TABLE,
    private readonly userIdIndex = process.env.USER_ID_INDEX,
    private readonly bucketName = process.env.ATTACHMENT_S3_BUCKET,
    private readonly s3: AWS.S3 = new XAWS.S3({ signatureVersion: 'v4' }),
    private readonly urlExpiration = Number(
      process.env?.SIGNED_URL_EXPIRATION || 400
    )
  ) {}

  async getAllTodos(userId: string, nextKey: Key, limit: number): Promise<PageableTodoItems> {
    logger.info('Getting all todo items')
    const result = await this.docClient.query({
      TableName: this.todosTable,
      IndexName: this.userIdIndex,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: nextKey
    }).promise()

    const items = result.Items as TodoItem[]
    return { todoItems: items, lastEvaluatedKey: result.LastEvaluatedKey }
  }

  async createTodo(todoItem: TodoItem): Promise<TodoItem> {
    logger.info(`Creating new todo item: ${todoItem.todoId}`)
    await this.docClient
      .put({
        TableName: this.todosTable,
        Item: todoItem
      })
      .promise()
    return todoItem
  }

  async updateTodo(todoId: string, userId: string, todoUpdate: TodoUpdate): Promise<TodoUpdate> {
    logger.info(`Updating a todo item: ${todoId}`)
    await this.docClient
      .update({
        TableName: this.todosTable,
        Key: {
          todoId,
          userId
        },
        UpdateExpression: 'set #name = :n, dueDate = :d, done = :done',
        ExpressionAttributeValues: {
          ':n': todoUpdate.name,
          ':d': todoUpdate.dueDate,
          ':done': todoUpdate.done
        },
        ExpressionAttributeNames: {
          '#name': 'name'
          //   '#dueDate': 'dueDate',
          //   '#done': 'done',
        }
      })
      .promise()
    return todoUpdate
  }

  async deleteTodoItem(todoId: string, userId: string): Promise<void> {
    logger.info(`Deleting a todo: ${todoId}`)
    await this.docClient
      .delete({
        TableName: this.todosTable,
        Key: {
          todoId,
          userId
        }
      })
      .promise()
  }

  async persistAttachmentUrl(
    todoId: string,
    userId: string
    // imageId: string
  ): Promise<void> {
    logger.info('Persisting an attachment url')
    console.log('attachmentURl:',`https://${this.bucketName}.s3.amazonaws.com/${todoId}`,todoId,userId)
    await this.docClient
      .update({
        TableName: this.todosTable,
        Key: {
          todoId,
          userId
        },
        UpdateExpression: 'set attachmentUrl = :a',
        ExpressionAttributeValues: {
          ':a': `https://${this.bucketName}.s3.amazonaws.com/${todoId}`
        }
      })
      .promise()
  }

  async generateUploadUrl(todoId: string): Promise<string> {
    logger.info('Generating an upload url')

    console.log(`generateUploadUrl with todoId=${todoId}, urlExpiration=${this.urlExpiration}, bucketName=${this.bucketName}`)
    return this.s3.getSignedUrl('putObject', {
      Bucket: this.bucketName,
      Key: todoId,
      Expires: this.urlExpiration
    })
  }

  async getTodosForUser(userId: string): Promise<TodoItem[]> {
    logger.info(`Getting all todos for user: ${userId}`)
    const result = await this.docClient
      .query({
        TableName: this.todosTable,
        IndexName: this.userIdIndex,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      })
      .promise()
    const items = result.Items
    return items as TodoItem[]
  }
}