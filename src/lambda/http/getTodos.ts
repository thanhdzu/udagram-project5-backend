import 'source-map-support/register'

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import * as middy from 'middy'
import { cors } from 'middy/middlewares'

import { getAllTodos } from '../../businessLogic/todos'
import { getUserId, parseLimitParameter, parseNextKeyParameter, encodeNextKey } from '../utils'

import { createLogger } from '../../utils/logger'
const logger = createLogger('createTodo')

// TODO: Get all TODO items for a current user
export const handler = middy(
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // Write your code here
    logger.info('Processing event: ', event)
    let nextKey // Next key to continue scan operation if necessary
    let limit // Maximum number of elements to return

      try {
        logger.info('This is queryStringParameters: ', event.queryStringParameters)
        // Parse query parameters
        nextKey = parseNextKeyParameter(event)
        limit = parseLimitParameter(event) || 20

        logger.info('This is nextKey: ', nextKey)
        logger.info('This is limit: ', limit)
      } catch (e) {
        logger.error('Failed to parse query parameters: ', e.message)
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Invalid parameters'
          })
        }
      }
    const userId = getUserId(event)
    logger.info(`This is userId: ${userId}`)
    const items = await getAllTodos(userId, nextKey, limit);
    return {
      statusCode: 200,
      body: JSON.stringify({
        items: items.todoItems,
        // Encode the JSON object so a client can return it in a URL as is
        nextKey: encodeNextKey(items.lastEvaluatedKey)
      })
    }
  }
)

handler.use(
  cors({
    origin: '*',
    credentials: true
  })
)