import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiDownload, FiPrinter } from "react-icons/fi";
import { motion } from "framer-motion";
import { formatPrice } from "../../../../shared/utils/helpers";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import { getOrderById } from "../../services/adminService";
import toast from "react-hot-toast";
import logoImage from "../../../../../data/logos/ChatGPT Image Dec 2, 2025, 03_01_19 PM.png";

const Invoice = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { settings } = useSettingsStore();
  const storeLogo = settings?.general?.storeLogo || logoImage;
  const storeName = settings?.general?.storeName || "Dwell Mart";

  useEffect(() => {
    const fetchOrder = async () => {
      setIsLoading(true);
      try {
        const response = await getOrderById(id);
        const o = response.data;

        // Normalize data to match UI structure
        const normalizedOrder = {
          ...o,
          id: o.orderId || o._id,
          customer: {
            name: o.userId?.name || 'Unknown',
            email: o.userId?.email || '',
            phone: o.userId?.phone || ''
          },
          date: o.createdAt,
          finalTotal: o.total
        };

        setOrder(normalizedOrder);
      } catch (error) {
        toast.error("Order not found");
        console.error("Order fetch error:", error);
        navigate("/admin/orders/all-orders");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [id, navigate]);

  if (isLoading || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // Get order items - handle array format safely
  const items = Array.isArray(order.items)
    ? order.items.map((item) => ({ ...item, price: Number(item.price || 0), quantity: Number(item.quantity || 1) }))
    : [];

  // Calculate totals directly from persisted backend order fields
  const subtotal = Number(order.subtotal ?? (order.total || 0));
  const tax = Number(order.tax ?? 0);
  const discount = Number(order.discount ?? order.couponDiscount ?? 0);
  const shipping = Number(order.shipping ?? order.quickCommerce?.deliveryFee ?? 0);
  const finalTotal = Number(order.total ?? (subtotal + tax + shipping - discount));

  // Format payment method
  const formatPaymentMethod = (method) => {
    if (!method) return "N/A";
    const methodMap = {
      card: "Credit Card",
      cod: "Cash on Delivery",
      wallet: "Wallet",
      creditCard: "Credit Card",
      cash: "Cash on Delivery",
    };
    return (
      methodMap[method.toLowerCase()] ||
      method.charAt(0).toUpperCase() + method.slice(1)
    );
  };

  const handleDownload = () => {
    const invoiceText = `
INVOICE
Order #${order.id}
Date: ${new Date(order.date).toLocaleString()}

Customer Information:
${order.customer?.name || "N/A"}
${order.customer?.email || "N/A"}
${order.customer?.phone || order.shippingAddress?.phone || ""}

Shipping Address:
${order.shippingAddress?.name || order.customer?.name || "N/A"}
${order.shippingAddress?.address || "N/A"}
${order.shippingAddress?.city || ""}, ${order.shippingAddress?.state || ""} ${order.shippingAddress?.zipCode || ""
      }
${order.shippingAddress?.country || ""}

Items:
${items
        .map(
          (item) =>
            `- ${item.name || "Item"} x${item.quantity || 1} - ${formatPrice(
              (item.price || 0) * (item.quantity || 1)
            )}`
        )
        .join("\n")}

Subtotal: ${formatPrice(subtotal)}
${discount > 0 ? `Discount: -${formatPrice(discount)}\n` : ""}
${tax > 0 ? `Tax: ${formatPrice(tax)}\n` : ""}
${shipping > 0 ? `Shipping: ${formatPrice(shipping)}\n` : ""}
Total: ${formatPrice(finalTotal)}

Payment Method: ${formatPaymentMethod(order.paymentMethod)}
Status: ${order.status}
${order.trackingNumber ? `Tracking Number: ${order.trackingNumber}` : ""}
    `.trim();

    const blob = new Blob([invoiceText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${order.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Invoice downloaded successfully!");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      {/* Header - Hidden in print */}
      <div className="no-print">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6">
          <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <FiArrowLeft className="text-lg text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
                  Invoice
                </h1>
                <p className="text-xs text-gray-500">Order #{order.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold">
                <FiDownload />
                Download
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold">
                <FiPrinter />
                Print
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Invoice Content - Only this prints */}
      <div className="invoice-content bg-white rounded-lg p-6 sm:p-8 shadow-sm border border-gray-200">
        {/* Logo and Invoice Header */}
        <div className="mb-8 pb-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-6">
            {/* Logo */}
            <div className="flex items-center justify-start sm:justify-start">
              <img
                src={storeLogo}
                alt={storeName}
                className="h-32 sm:h-40 md:h-48 w-auto object-contain"
                onError={(e) => {
                  e.target.src = logoImage;
                }}
              />
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-700 mb-1">Status</p>
              <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold capitalize">
                {order.status}
              </span>
            </div>
          </div>

          {/* Invoice Title */}
          <div className="mt-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">INVOICE</h2>
            <p className="text-gray-600">
              Order #<span className="font-semibold">{order.id}</span>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Date: {new Date(order.date).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Customer & Shipping Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-3 uppercase">
              Bill To
            </h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p className="font-semibold">{order.customer?.name || "N/A"}</p>
              <p>{order.customer?.email || "N/A"}</p>
              {order.customer?.phone && <p>{order.customer.phone}</p>}
            </div>
          </div>
          {order.shippingAddress && (
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-3 uppercase">
                Ship To
              </h3>
              <div className="text-sm text-gray-700 space-y-1">
                <p className="font-semibold">
                  {order.shippingAddress.name || order.customer?.name || "N/A"}
                </p>
                {order.shippingAddress.address && (
                  <p>{order.shippingAddress.address}</p>
                )}
                {(order.shippingAddress.city ||
                  order.shippingAddress.state ||
                  order.shippingAddress.zipCode) && (
                    <p>
                      {[
                        order.shippingAddress.city,
                        order.shippingAddress.state,
                        order.shippingAddress.zipCode,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                {order.shippingAddress.country && (
                  <p>{order.shippingAddress.country}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Items Table */}
        <div className="mb-8">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Item
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  Quantity
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                  Unit Price
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item, index) => {
                const itemTotal = (item.price || 0) * (item.quantity || 1);
                return (
                  <tr key={item.id || index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {item.name || `Item ${index + 1}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-center">
                      {item.quantity || 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">
                      {formatPrice(item.price || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">
                      {formatPrice(itemTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full sm:w-80 space-y-2">
            <div className="flex justify-between text-sm text-gray-700">
              <span>Subtotal:</span>
              <span className="font-semibold">{formatPrice(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount:</span>
                <span className="font-semibold">-{formatPrice(discount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-sm text-gray-700">
                <span>Tax:</span>
                <span className="font-semibold">{formatPrice(tax)}</span>
              </div>
            )}
            {shipping > 0 && (
              <div className="flex justify-between text-sm text-gray-700">
                <span>Shipping:</span>
                <span className="font-semibold">{formatPrice(shipping)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-800 pt-3 border-t border-gray-200">
              <span>Total:</span>
              <span>{formatPrice(finalTotal)}</span>
            </div>
          </div>
        </div>

        {/* Payment & Tracking Info */}
        <div className="mt-8 pt-6 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-semibold text-gray-800 mb-1">Payment Method:</p>
            <p className="text-gray-600">
              {formatPaymentMethod(order.paymentMethod)}
            </p>
          </div>
          {order.trackingNumber && (
            <div>
              <p className="font-semibold text-gray-800 mb-1">
                Tracking Number:
              </p>
              <p className="text-gray-600 font-mono">{order.trackingNumber}</p>
            </div>
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            margin: 0.5in;
            size: A4;
          }
          
          body * {
            visibility: hidden;
          }
          
          .invoice-content,
          .invoice-content * {
            visibility: visible;
          }
          
          .invoice-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0 !important;
            padding: 1.5rem !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          
          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }
          
          button {
            display: none !important;
          }
          
          .invoice-content table {
            page-break-inside: avoid;
          }
          
          .invoice-content tr {
            page-break-inside: avoid;
          }
          
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        
        @media screen {
          .invoice-content {
            margin-top: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Invoice;
