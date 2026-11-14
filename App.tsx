import React from 'react';
import CustomerApp from './apps/customer/App';

/**
 * Root Monorepo Fallback Entry Point
 *
 * When `expo start` is invoked directly from the monorepo root directory
 * instead of `apps/customer` or `apps/staff`, Metro's `AppEntry.js` resolves `../../App`.
 * This wrapper safely delegates to the Customer App to prevent bundling crashes.
 *
 * To run a specific mobile app explicitly:
 * - Customer App: `npm run dev:customer` (or `cd apps/customer && npx expo start`)
 * - Staff App:    `npm run dev:staff` (or `cd apps/staff && npx expo start`)
 */
export default function RootMonorepoApp() {
  return <CustomerApp />;
}
