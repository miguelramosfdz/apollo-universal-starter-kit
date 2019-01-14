import { isApiExternal } from '@module/core-common';

import { AuthenticationError } from 'apollo-server-errors';
import { writeSession, createSession, readSession } from './sessions';
import AccessModule from '../AccessModule';
import schema from './schema.graphql';
import resolvers from './resolvers';
import scopes from '../../scopes';
import User from '../../sql';
import settings from '../../../../../settings';

const grant = async (user, req) => {
  const session = {
    ...req.session,
    userId: user.id,
    authSalt: user.authSalt
  };

  req.session = writeSession(req, session);
};

const getCurrentUser = async ({ req }) => {
  if (req && req.session.userId && req.session.authSalt) {
    const result = await User.getUser(req.session.userId);
    if (result && result.authSalt === req.session.authSalt) {
      return result;
    }

    delete req.session.userId;
    delete req.session.authSalt;
    writeSession(req, req.session);

    throw new AuthenticationError();
  }
  return null;
};

const attachSession = req => {
  if (req) {
    req.session = readSession(req);
    if (!req.session) {
      req.session = createSession(req);
    } else {
      if (!isApiExternal && req.path === __API_URL__) {
        if (req.universalCookies.get('x-token') !== req.session.csrfToken) {
          req.session = createSession(req);
          throw new Error('CSRF token validation failed');
        }
      }
    }
  }
};

const createContextFunc = async ({ req, connectionParams, webSocket, context }) => {
  attachSession(req);
  const user = context.user || (await getCurrentUser({ req, connectionParams, webSocket }));
  const auth = {
    isAuthenticated: !!user,
    scope: user ? scopes[user.role] : null
  };

  return {
    User,
    user,
    auth
  };
};

export default new AccessModule(
  settings.user.auth.access.session.enabled
    ? {
        grant: [grant],
        schema: [schema],
        createResolversFunc: [resolvers],
        createContextFunc: [createContextFunc]
      }
    : {}
);
