const http = require('http');
const url = require('url');

function matchRoute(routePath, actualPath, method, targetMethod) {
  if (method !== targetMethod) return { match: false };
  const routeParts = routePath.split('/').filter(Boolean);
  const urlParts = actualPath.split('/').filter(Boolean);
  if (routeParts.length !== urlParts.length) return { match: false };
  const params = {};
  for (let i = 0; i < routeParts.length; i += 1) {
    const part = routeParts[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = urlParts[i];
    } else if (part !== urlParts[i]) {
      return { match: false };
    }
  }
  return { match: true, params };
}

function express() {
  const routes = [];
  const middlewares = [];

  const app = {
    use(fn) {
      middlewares.push(fn);
    },
    get(path, handler) {
      routes.push({ method: 'GET', path, handler });
    },
    post(path, handler) {
      routes.push({ method: 'POST', path, handler });
    },
    patch(path, handler) {
      routes.push({ method: 'PATCH', path, handler });
    },
    listen(port, cb) {
      const server = http.createServer((req, res) => {
        const parsed = url.parse(req.url, true);
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          if (body && req.headers['content-type']?.includes('application/json')) {
            try {
              req.body = JSON.parse(body);
            } catch (err) {
              req.body = {};
            }
          }

          let idx = 0;
          const next = () => {
            if (idx < middlewares.length) {
              const mw = middlewares[idx++];
              return mw(req, res, next);
            }
            return null;
          };
          next();

          const route = routes.find((r) => matchRoute(r.path, parsed.pathname, r.method, req.method).match);
          if (!route) {
            res.statusCode = 404;
            return res.end();
          }

          const { params } = matchRoute(route.path, parsed.pathname, route.method, req.method);
          req.params = params;
          req.query = parsed.query;
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (payload) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          };
          return route.handler(req, res);
        });
      });

      return server.listen(port, cb);
    },
  };

  return app;
}

express.Router = () => express();
express.json = () => (req, _res, next) => next();
express.static = () => (req, _res, next) => next();

module.exports = express;
module.exports.default = express;

