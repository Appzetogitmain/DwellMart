/**
 * Admin Shipments List — overview of all DTDC shipments.
 *
 * Shows a filterable, paginated table of all Shipment records with
 * AWB, order ID, status, service type, and booked date.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiTruck, FiRefreshCw, FiSearch, FiPackage, FiChevronLeft, FiChevronRight, FiClock, FiAlertTriangle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Badge from '../../../../shared/components/Badge';
import { getShipments, getOrdersAwaitingBooking } from '../../services/adminService';

const STATUS_MAP = {
  pending:          { label: 'Pending',          variant: 'pending' },
  booked:           { label: 'Booked',           variant: 'processing' },
  picked_up:        { label: 'Picked Up',        variant: 'processing' },
  in_transit:       { label: 'In Transit',       variant: 'shipped' },
  out_for_delivery: { label: 'Out for Delivery', variant: 'shipped' },
  delivered:        { label: 'Delivered',         variant: 'delivered' },
  cancelled:        { label: 'Cancelled',         variant: 'cancelled' },
  rto:              { label: 'RTO',              variant: 'cancelled' },
  ndr:              { label: 'NDR',              variant: 'pending' },
  failed:           { label: 'Failed',           variant: 'cancelled' },
};

const Shipments = () => {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  /**
   * 'booked'   — consignments that exist
   * 'awaiting' — orders ready to ship with no consignment yet
   *
   * Two views of the same pipeline, sharing one table shell rather than a
   * second screen with its own visual language.
   */
  const [tab, setTab] = useState('booked');
  const [awaiting, setAwaiting] = useState([]);
  const [awaitingTotal, setAwaitingTotal] = useState(0);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await getShipments(params);
      const data = res?.data || {};
      setShipments(data.shipments || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch {
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  const fetchAwaiting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrdersAwaitingBooking({ page, limit: 20 });
      const data = res?.data || {};
      setAwaiting(data.orders || []);
      setAwaitingTotal(data.total || 0);
      setTotalPages(data.pages || 1);
    } catch {
      setAwaiting([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (tab === 'awaiting') fetchAwaiting();
    else fetchShipments();
  }, [tab, fetchAwaiting, fetchShipments]);

  // The awaiting count is needed on the tab itself, so it is fetched even
  // while the booked view is showing.
  useEffect(() => {
    getOrdersAwaitingBooking({ limit: 1 })
      .then((res) => setAwaitingTotal(res?.data?.total || 0))
      .catch(() => {});
  }, []);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiTruck className="text-2xl text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">DTDC Shipments</h1>
            <p className="text-sm text-gray-500">
              {tab === 'awaiting'
                ? `${awaitingTotal} order${awaitingTotal === 1 ? '' : 's'} awaiting booking`
                : `${total} total shipments`}
            </p>
          </div>
        </div>
        <button
          onClick={() => (tab === 'awaiting' ? fetchAwaiting() : fetchShipments())}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          { id: 'booked', label: 'Shipments', Icon: FiTruck, count: null },
          { id: 'awaiting', label: 'Awaiting Booking', Icon: FiClock, count: awaitingTotal },
        ].map(({ id, label, Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id); setPage(1); }}
            aria-selected={tab === id}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} />
            {label}
            {count > 0 && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className={`flex flex-wrap gap-3 ${tab === 'awaiting' ? 'hidden' : ''}`}>
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by AWB or Order ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_MAP).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-gray-500 mt-2">Loading shipments...</p>
          </div>
        ) : tab === 'awaiting' ? (
          awaiting.length === 0 ? (
            <div className="p-8 text-center">
              <FiPackage className="mx-auto text-4xl text-gray-300 mb-3" />
              <p className="text-gray-500">Every retail and wholesale order has been booked.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Order ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Vendor</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Channel</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Waiting</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Ready Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {awaiting.map((o) => (
                    <tr
                      key={o._id}
                      onClick={() => navigate(`/admin/orders/${o._id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-blue-700">{o.orderId}</td>
                      <td className="px-4 py-3 text-gray-700">{o.vendorName || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={o.fulfillmentType === 'wholesale' ? 'processing' : 'shipped'}>
                          {o.fulfillmentType === 'wholesale' ? 'Wholesale' : 'Retail'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{o.status}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${
                          o.isCritical ? 'text-red-700' : o.isOverdue ? 'text-amber-700' : 'text-gray-600'
                        }`}>
                          {(o.isCritical || o.isOverdue) && <FiAlertTriangle size={13} />}
                          {o.hoursAwaiting}h
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(o.readySince)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : shipments.length === 0 ? (
          <div className="p-8 text-center">
            <FiPackage className="mx-auto text-4xl text-gray-300 mb-3" />
            <p className="text-gray-500">No shipments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">AWB Number</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Order ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Service</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Booked</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Delivered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shipments.map((s) => {
                  const st = STATUS_MAP[s.status] || STATUS_MAP.pending;
                  return (
                    <tr
                      key={s._id}
                      onClick={() => navigate(`/admin/orders/${s.orderId?._id || s.orderId}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-medium text-blue-700">
                        {s.awbNumber || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {s.orderId?.orderId || s.orderId || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.serviceType || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(s.bookedAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(s.deliveredAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50 hover:bg-white transition-colors"
              >
                <FiChevronLeft size={14} /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50 hover:bg-white transition-colors"
              >
                Next <FiChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Shipments;
