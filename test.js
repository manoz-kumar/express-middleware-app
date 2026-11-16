import test from "node:test";
import assert from "node:assert";
import { Readable, Duplex } from "node:stream";

process.env.NODE_ENV = "test";
const { default: app } = await import("./server.js");

function request(app, options = {}) {
  const { method = "GET", url = "/", body = null, headers = {} } = options;
  return new Promise((resolve, reject) => {
    const rawBody = body ? (typeof body === "string" ? body : JSON.stringify(body)) : null;

    const req = new Readable({
      read() {
        if (rawBody) {
          this.push(rawBody);
        }
        this.push(null);
      },
    });

    const socket = new Duplex({
      read() {},
      write(chunk, encoding, callback) {
        callback();
      },
    });
    socket.remoteAddress = "127.0.0.1";

    req.method = method;
    req.url = url;
    req.headers = {
      ...(rawBody
        ? {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(rawBody),
          }
        : {}),
      ...headers,
    };
    req.socket = socket;
    req.connection = socket;

    let resStatusCode = 200;
    const resHeaders = {};
    let responseBody = "";

    const res = {
      statusCode: 200,
      setHeader(k, v) {
        resHeaders[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return resHeaders[k.toLowerCase()];
      },
      writeHead(code, h) {
        resStatusCode = code;
        if (h) Object.assign(resHeaders, h);
      },
      status(code) {
        this.statusCode = code;
        resStatusCode = code;
        return this;
      },
      json(data) {
        this.setHeader("content-type", "application/json");
        responseBody = JSON.stringify(data);
        this.end(responseBody);
      },
      send(data) {
        responseBody = typeof data === "object" ? JSON.stringify(data) : String(data);
        this.end(responseBody);
      },
      end(chunk) {
        if (chunk) responseBody = chunk;
        resolve({
          status: this.statusCode || resStatusCode,
          headers: resHeaders,
          body: responseBody,
          json: () => {
            try {
              return JSON.parse(responseBody);
            } catch {
              return null;
            }
          },
        });
      },
      on() {},
      emit() {},
    };

    app(req, res, (err) => {
      if (err) {
        const status = err.statusCode || 500;
        resolve({
          status,
          headers: resHeaders,
          body: err.message,
          json: () => null,
        });
      } else {
        resolve({
          status: res.statusCode || resStatusCode,
          headers: resHeaders,
          body: responseBody,
          json: () => {
            try {
              return JSON.parse(responseBody);
            } catch {
              return null;
            }
          },
        });
      }
    });
  });
}

test("GET / returns 200 and API info", async () => {
  const res = await request(app, { method: "GET", url: "/" });
  assert.strictEqual(res.status, 200);
  const data = res.json();
  assert.strictEqual(data.status, "success");
});

test("POST /api/v1/patients creates record with valid data", async () => {
  const res = await request(app, {
    method: "POST",
    url: "/api/v1/patients",
    body: { name: "John Doe", age: 35, ward: "General" },
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body, "Patient record created successfully");
});

test("POST /api/v1/patients fails validation when fields are missing", async () => {
  const res = await request(app, {
    method: "POST",
    url: "/api/v1/patients",
    body: { name: "John Doe" },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body, "Patient details missing");
});

test("GET /api/v1/patients returns all patient records", async () => {
  const res = await request(app, { method: "GET", url: "/api/v1/patients" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, "All patient records fetched successfully");
});

test("GET /api/v1/patients?ward=ICU filters by ward", async () => {
  const res = await request(app, { method: "GET", url: "/api/v1/patients?ward=ICU" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, "ICU patient records fetched successfully");
});

test("GET /api/v1/patients/:id returns patient by id", async () => {
  const res = await request(app, { method: "GET", url: "/api/v1/patients/42" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, "Patient record with Id 42 fetched successfully");
});

test("PUT /api/v1/patients/:id updates patient record", async () => {
  const res = await request(app, {
    method: "PUT",
    url: "/api/v1/patients/42",
    body: { name: "Jane Doe" },
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, "Patient record with ID 42 updated successfully");
});

test("DELETE /api/v1/patients/:id deletes patient record", async () => {
  const res = await request(app, { method: "DELETE", url: "/api/v1/patients/42" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, "Patient record with ID 42 deleted successfully");
});

test("GET /unknown returns 404 Page not found", async () => {
  const res = await request(app, { method: "GET", url: "/unknown" });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body, "Page not found");
});
