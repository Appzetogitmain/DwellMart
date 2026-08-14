/**
 * Migration registry.
 *
 * Ordered by id. Add new migrations here; the runner sorts by id, so the
 * numeric prefix is the execution order.
 */

import m0001 from './0001_bootstrap_migration_ledger.js';
import m0002 from './0002_subscription_activation_source.js';
import m0003 from './0003_refund_ledger.js';
import m0004 from './0004_settlement_and_commission_guards.js';
import m0005 from './0005_strip_retired_permissions.js';
import m0006 from './0006_integration_key_hash_hygiene.js';
import m0007 from './0007_variant_aware_reservations.js';
import m0008 from './0008_vendor_channels.js';
import m0009 from './0009_order_channel_attribution.js';
import m0010 from './0010_vendor_channel_migration_stamp.js';

export const MIGRATIONS = [
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
    m0006,
    m0007,
    m0008,
    m0009,
    m0010,
];

export default MIGRATIONS;
