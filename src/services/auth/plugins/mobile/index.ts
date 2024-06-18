import { StatusCodes } from 'http-status-codes';

import { FastifyPluginAsync } from 'fastify';

import { RecaptchaAction } from '@graasp/sdk';
import { DEFAULT_LANG } from '@graasp/translations';

import { notUndefined } from '../../../../utils/assertions.js';
import {
  LOGIN_TOKEN_EXPIRATION_IN_MINUTES,
  MOBILE_DEEP_LINK_PROTOCOL,
} from '../../../../utils/config.js';
import { buildRepositories } from '../../../../utils/repositories.js';
import { generateAuthTokensPair, getRedirectionUrl } from '../../utils.js';
import captchaPreHandler from '../captcha/index.js';
import {
  SHORT_TOKEN_PARAM,
  TOKEN_PARAM,
  authenticateJWTChallengeVerifier,
  authenticateMobileMagicLink,
  authenticatePassword,
  authenticateRefreshToken,
} from '../passport/index.js';
import { authWeb, mPasswordLogin, mauth, mlogin, mregister } from './schemas.js';

// token based auth and endpoints for mobile
const plugin: FastifyPluginAsync = async (fastify) => {
  const {
    log,
    db,
    memberPassword: { service: memberPasswordService },
    mobile: { service: mobileService },
  } = fastify;

  // no need to add CORS support here - only used by mobile app

  fastify.post<{
    Body: {
      name: string;
      email: string;
      challenge: string;
      captcha: string;
      enableSaveActions?: boolean;
    };
    Querystring: { lang?: string };
  }>(
    '/register',
    {
      schema: mregister,
      preHandler: captchaPreHandler(RecaptchaAction.SignUpMobile),
    },
    async (request, reply) => {
      const {
        body,
        query: { lang = DEFAULT_LANG },
      } = request;

      return db.transaction(async (manager) => {
        await mobileService.register(undefined, buildRepositories(manager), body, lang);
        reply.status(StatusCodes.NO_CONTENT);
      });
    },
  );

  fastify.post<{
    Body: { email: string; challenge: string; captcha: string };
    Querystring: { lang?: string };
  }>(
    '/login',
    {
      schema: mlogin,
      preHandler: captchaPreHandler(RecaptchaAction.SignInMobile),
    },
    async (request, reply) => {
      const {
        body,
        query: { lang },
      } = request;

      await mobileService.login(undefined, buildRepositories(), body, lang);
      reply.status(StatusCodes.NO_CONTENT);
    },
  );

  // login with password
  fastify.post<{ Body: { email: string; challenge: string; password: string; captcha: string } }>(
    '/login-password',
    {
      schema: mPasswordLogin,

      preHandler: [
        captchaPreHandler(RecaptchaAction.SignInWithPasswordMobile, {
          shouldFail: false,
        }),
        authenticatePassword,
      ],
    },
    async (request, reply) => {
      const {
        user,
        body: { challenge },
      } = request;
      const member = notUndefined(user?.member);

      const token = memberPasswordService.generateToken(
        { sub: member.id, challenge: challenge },
        // Expiration duration is given in {XX}m format (e.g. 30m) to indicate the minutes.
        `${LOGIN_TOKEN_EXPIRATION_IN_MINUTES}m`,
      );

      // redirect to the universal link domain
      const redirectionUrl = new URL(`${MOBILE_DEEP_LINK_PROTOCOL}//auth`);
      redirectionUrl.searchParams.set(SHORT_TOKEN_PARAM, token);
      reply.status(StatusCodes.SEE_OTHER);

      return { resource: redirectionUrl.toString() };
    },
  );

  fastify.post<{ Body: { [SHORT_TOKEN_PARAM]: string; verifier: string } }>(
    '/auth',
    {
      schema: mauth,
      preHandler: authenticateJWTChallengeVerifier,
    },
    async ({ user }) => {
      const member = notUndefined(user?.member);
      return generateAuthTokensPair(member.id);
    },
  );

  fastify.get(
    '/auth/refresh',
    {
      preHandler: authenticateRefreshToken,
    },
    async ({ user }) => {
      const member = notUndefined(user?.member);
      return generateAuthTokensPair(member.id);
    },
  );

  // from user token, set corresponding cookie
  fastify.get<{ Querystring: { [TOKEN_PARAM]: string; url: string } }>(
    '/auth/web',
    {
      schema: authWeb,
      preHandler: authenticateMobileMagicLink,
    },
    async ({ query }, reply) => {
      const redirectionUrl = getRedirectionUrl(
        log,
        query.url ? decodeURIComponent(query.url) : undefined,
      );
      reply.redirect(StatusCodes.SEE_OTHER, redirectionUrl);
    },
  );
};

export default plugin;
