/**
 * Auth0 Action: "Inject SaludDeUna Custom Claims"
 * Trigger: Login / Post Login
 *
 * Paste this script in Auth0 Dashboard:
 *   Actions → Library → Create Action → Login / Post Login
 *
 * This Action adds custom claims to the Access Token so the backend (NestJS)
 * can identify and authorize users without a database lookup on every request.
 *
 * Claims added (namespace: https://salud-de-una.com/):
 *   db_id     — MongoDB _id of the user (set by POST /auth/provision/* endpoint)
 *   role      — "PATIENT" | "DOCTOR" | "ADMIN" (first Auth0 Role assigned to the user)
 *   is_active — boolean (default true; set to false to deactivate the user)
 *   email     — user's email address
 *
 * IMPORTANT: After creating this Action, click "Deploy" then add it to the
 * Login flow: Actions → Flows → Login → drag the Action into the flow.
 */
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://salud-de-una.com/';

  // db_id and is_active come from app_metadata (set by the backend provisioning endpoint)
  const dbId = event.user.app_metadata?.db_id;
  const isActive = event.user.app_metadata?.is_active;

  // role comes from the Auth0 Role assigned via the Management API
  // event.authorization.roles is populated only when RBAC is enabled in the API settings
  const role = event.authorization?.roles?.[0];

  if (dbId) {
    api.accessToken.setCustomClaim(`${namespace}db_id`, dbId);
  }

  if (role) {
    api.accessToken.setCustomClaim(`${namespace}role`, role);
  }

  // Default is_active to true if not set (new users before first deactivation)
  api.accessToken.setCustomClaim(`${namespace}is_active`, isActive ?? true);

  // Include email so the provision endpoint can read it from the access token
  // without a separate /userinfo call (reduces latency during provisioning)
  api.accessToken.setCustomClaim(`${namespace}email`, event.user.email);
};
