/**
 * Test helpers — mock/stub InternalProxy for route tests.
 */

import type { InternalProxy, ProxyResponse, ProxyRequestHeaders } from "../src/proxy.js";

export interface StubResponse<T = unknown> {
  status?: number;
  data?: T;
}

/**
 * Creates a stub InternalProxy that returns canned responses.
 * Routes use proxy.forwardToIngestion / forwardToRetrieval / forwardToConnector.
 */
export function createStubProxy(responses: {
  ingestion?: StubResponse;
  retrieval?: StubResponse;
  connector?: StubResponse;
}): InternalProxy {
  const defaultResponse: ProxyResponse = {
    status: 200,
    data: { ok: true },
    headers: new Headers({ "content-type": "application/json" }),
  };

  function makeResponse<T>(stub?: StubResponse<T>): ProxyResponse<T> {
    return {
      status: stub?.status ?? 200,
      data: (stub?.data ?? { ok: true }) as T,
      headers: new Headers({ "content-type": "application/json" }),
    };
  }

  const proxy = {
    forwardToIngestion: <T>(
      _path: string,
      _method: string,
      _headers: ProxyRequestHeaders,
      _body?: unknown,
    ): Promise<ProxyResponse<T>> => {
      return Promise.resolve(makeResponse<T>(responses.ingestion as StubResponse<T> | undefined));
    },

    forwardToRetrieval: <T>(
      _path: string,
      _method: string,
      _headers: ProxyRequestHeaders,
      _body?: unknown,
    ): Promise<ProxyResponse<T>> => {
      return Promise.resolve(makeResponse<T>(responses.retrieval as StubResponse<T> | undefined));
    },

    forwardToConnector: <T>(
      _path: string,
      _method: string,
      _headers: ProxyRequestHeaders,
      _body?: unknown,
    ): Promise<ProxyResponse<T>> => {
      return Promise.resolve(makeResponse<T>(responses.connector as StubResponse<T> | undefined));
    },
  };

  return proxy as unknown as InternalProxy;
}

export { createStubProxy as createTestProxy };
