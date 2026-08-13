/**
 * 0005 — Remove retired permission tokens from existing admin records.
 *
 * Seven tokens were removed because no route could enforce them:
 * `wholesale.vendors.manage`, `wholesale.products.manage`, `vendors.delete`,
 * and the four `subadmin.*` tokens (sub-admin management is superadmin-only by
 * design and deliberately non-delegable).
 *
 * They are stripped from `Admin.permissions` so the sub-admin UI stops showing
 * grants that were never honoured. This REMOVES NO REAL ACCESS: every one of
 * these tokens was inert, so no admin loses a capability they actually had.
 *
 * Idempotent — a second run matches nothing.
 */

import mongoose from 'mongoose';
import Admin from '../models/Admin.model.js';
import { RETIRED_PERMISSIONS } from '../constants/permissions.js';

export default {
    id: '0005_strip_retired_permissions',
    description: 'Strip inert retired permission tokens from admin records',

    async up() {
        const affected = await Admin.find({ permissions: { $in: RETIRED_PERMISSIONS } })
            .select('_id email permissions')
            .lean();

        if (affected.length === 0) {
            return { adminsUpdated: 0, tokensRemoved: 0 };
        }

        // Report before mutating — the operator should see which accounts held
        // grants that were never real.
        let tokensRemoved = 0;
        for (const admin of affected) {
            const stale = (admin.permissions || []).filter((p) => RETIRED_PERMISSIONS.includes(p));
            tokensRemoved += stale.length;
            console.log(
                `[migrate 0005] admin=${admin.email || admin._id} removing inert tokens: ${stale.join(', ')}`
            );
        }

        const result = await Admin.updateMany(
            { permissions: { $in: RETIRED_PERMISSIONS } },
            { $pull: { permissions: { $in: RETIRED_PERMISSIONS } } }
        );

        console.log(
            `[migrate 0005] ${result.modifiedCount} admin record(s) updated; `
            + `${tokensRemoved} inert grant(s) removed. No real access was changed.`
        );

        return { adminsUpdated: result.modifiedCount, tokensRemoved };
    },

    async verify() {
        const remaining = await Admin.countDocuments({ permissions: { $in: RETIRED_PERMISSIONS } });
        return {
            ok: remaining === 0,
            detail: `${remaining} admin record(s) still hold a retired token`,
        };
    },
};
