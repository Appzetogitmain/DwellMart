/**
 * Authentication for the integration suites.
 *
 * Tokens are always obtained by calling the real login endpoint. Forging a JWT
 * would be faster but would skip the account-state gates each login enforces —
 * vendor approval and onboarding, rider application status, user verification —
 * and those gates are part of what the suites exist to protect.
 *
 * A login failure here is therefore a genuine finding, not a fixture problem,
 * and the error message says so.
 */

import { post, describeResult } from './client.mjs';

const loginAt = async (routePath, email, password, actorLabel) => {
    const result = await post(routePath, { body: { email, password } });

    if (!result.ok || !result.data?.accessToken) {
        throw new Error(
            `Failed to authenticate ${actorLabel} via ${routePath}: ${describeResult(result)}. `
            + 'The seeded account did not satisfy this login\'s account-state gates.'
        );
    }

    return {
        token: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        profile: result.data,
    };
};

export const loginCustomer = (email, password) =>
    loginAt('/user/auth/login', email, password, 'customer');

export const loginVendor = (email, password) =>
    loginAt('/vendor/auth/login', email, password, 'vendor');

export const loginRider = (email, password) =>
    loginAt('/delivery/auth/login', email, password, 'delivery partner');

export const loginAdmin = (email, password) =>
    loginAt('/admin/auth/login', email, password, 'admin');

/**
 * Log in every actor in a seeded world in one call.
 * @param {object} world result of `seedStandardWorld()`
 */
export const authenticateWorld = async (world) => {
    const [customer, vendor, admin, quickRider, marketplaceRider] = await Promise.all([
        loginCustomer(world.customer.email, world.customer.password),
        loginVendor(world.vendor.email, world.vendor.password),
        loginAdmin(world.admin.email, world.admin.password),
        loginRider(world.quickRider.email, world.quickRider.password),
        loginRider(world.marketplaceRider.email, world.marketplaceRider.password),
    ]);

    return { customer, vendor, admin, quickRider, marketplaceRider };
};
