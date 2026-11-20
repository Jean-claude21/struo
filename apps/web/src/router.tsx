import { createRouter } from '@tanstack/react-router';
import { ErrorPage } from './components/ErrorPage.tsx';
import { routeTree } from './routeTree.gen';

export const getRouter = () =>
  createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 10_000,
    // A page that breaks shows a clear message with a code, and the error is reported (spec 041).
    defaultErrorComponent: ErrorPage,
  });
