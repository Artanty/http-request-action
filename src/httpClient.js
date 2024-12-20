'use strict'

const axios = require('axios');
const url = require('url');
const { GithubActions } = require('./githubActions');
const { convertToJSON, convertToFormData, retry } = require('./helper');

const METHOD_GET = 'GET'
const METHOD_POST = 'POST'

const HEADER_CONTENT_TYPE = 'Content-Type'

const CONTENT_TYPE_URLENCODED = 'application/x-www-form-urlencoded'

/**
 * @param {Object} param0
 * @param {string} param0.method HTTP Method
 * @param {axios.AxiosRequestConfig} param0.instanceConfig
 * @param {string} param0.data Request Body as string, default {}
 * @param {GithubActions} param0.actions 
 * @param {{ 
 *  ignoredCodes: number[];
 *  preventFailureOnNoResponse: boolean,
 *  escapeData: boolean;
 *  retry: number;
 *  retryWait: number;
 * }} param0.options
 *
 * @returns {Promise<axios.AxiosResponse>}
 */
const request = async ({ method, instanceConfig, data, actions, options }) => {
  actions.debug(`options: ${JSON.stringify(options)}`)
  
  try {
    if (options.escapeData) {
      data = data.replace(/"[^"]*"/g, (match) => { 
        return match.replace(/[\n\r]\s*/g, "\\n");
      }); 
    }

    if (method === METHOD_GET) {
      data = undefined;
    }

    if (instanceConfig.headers[HEADER_CONTENT_TYPE] === CONTENT_TYPE_URLENCODED) {
      let dataJson = convertToJSON(data)
      if (typeof dataJson === 'object' && Object.keys(dataJson).length) {
        data = (new url.URLSearchParams(dataJson)).toString();
      }
    }

    const requestData = {
      method,
      data,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }

    actions.debug('Instance Configuration: ' + JSON.stringify(instanceConfig))
    
    /** @type {axios.AxiosInstance} */
    const instance = axios.create(instanceConfig);

    actions.debug('Request Data: ' + JSON.stringify(requestData))

    const execRequest = async () => {
      try {
        return await instance.request(requestData)
      } catch(error) {
        if (error.response && options.ignoredCodes.includes(error.response.status)) {
          actions.warning(`ignored status code: ${JSON.stringify({ code: error.response.status, message: error.response.data })}`)

          return error.response
        }

        if (!error.response && error.request && options.preventFailureOnNoResponse) {
          actions.warning(`no response received: ${JSON.stringify(error)}`);

          return null
        }

        throw error
      }
    }

    /** @type {axios.AxiosResponse|null} */
    const response = await retry(execRequest, {
      actions,
      retry: options.retry || 0,
      sleep: options.retryWait // wait time after each retry
    })

    if (!response) {
      return null
    }

    return response
  } catch (error) {
    if ((typeof error === 'object') && (error.isAxiosError === true)) {
      const { name, message, code, response } = error
      actions.setOutput('requestError', JSON.stringify({ name, message, code, status: response && response.status ? response.status : null }));
    }

    if (error.response) {
      actions.setFailed(JSON.stringify({ code: error.response.status, message: error.response.data }))
    } else if (error.request) {
      actions.setFailed(JSON.stringify({ error: "no response received 2", message: error.message, errorFull: error }));
    } else {
      actions.setFailed(JSON.stringify({ message: error.message, data }));
    }
  }
}

module.exports = {
  request,
  METHOD_POST,
  METHOD_GET,
}
