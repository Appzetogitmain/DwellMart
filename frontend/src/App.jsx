import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./theme";

import CartDrawer from "./shared/components/Cart/CartDrawer";
import ProtectedRoute from "./shared/components/Auth/ProtectedRoute";
import ErrorBoundary from "./shared/components/ErrorBoundary/ErrorBoundary";
import AdminLogin from "./modules/Admin/pages/Login";
import AdminProtectedRoute from "./modules/Admin/components/AdminProtectedRoute";
import AdminLayout from "./modules/Admin/components/Layout/AdminLayout";
import Dashboard from "./modules/Admin/pages/Dashboard";
import Products from "./modules/Admin/pages/Products";
import ProductForm from "./modules/Admin/pages/ProductForm";
import AdminOrders from "./modules/Admin/pages/Orders";
import OrderDetail from "./modules/Admin/pages/OrderDetail";
import ReturnRequests from "./modules/Admin/pages/ReturnRequests";
import ReturnRequestDetail from "./modules/Admin/pages/ReturnRequestDetail";
import Categories from "./modules/Admin/pages/Categories";
import Brands from "./modules/Admin/pages/Brands";
import Customers from "./modules/Admin/pages/Customers";

import Campaigns from "./modules/Admin/pages/Campaigns";
import Banners from "./modules/Admin/pages/Banners";
import Testimonials from "./modules/Admin/pages/Testimonials";
import Reviews from "./modules/Admin/pages/Reviews";
import Analytics from "./modules/Admin/pages/Analytics";
import Content from "./modules/Admin/pages/Content";
import Settings from "./modules/Admin/pages/Settings";
import More from "./modules/Admin/pages/More";
import PromoCodes from "./modules/Admin/pages/PromoCodes";
// Orders child pages
import AllOrders from "./modules/Admin/pages/orders/AllOrders";
import OrderTracking from "./modules/Admin/pages/orders/OrderTracking";

import Invoice from "./modules/Admin/pages/orders/Invoice";
// Products child pages
import ManageProducts from "./modules/Admin/pages/products/ManageProducts";
import TaxPricing from "./modules/Admin/pages/products/TaxPricing";
import ProductRatings from "./modules/Admin/pages/products/ProductRatings";

// Categories child pages
import ManageCategories from "./modules/Admin/pages/categories/ManageCategories";
import CategoryOrder from "./modules/Admin/pages/categories/CategoryOrder";
// Brands child pages
import ManageBrands from "./modules/Admin/pages/brands/ManageBrands";
// Customers child pages
import ViewCustomers from "./modules/Admin/pages/customers/ViewCustomers";
import CustomerAddresses from "./modules/Admin/pages/customers/Addresses";
import Transactions from "./modules/Admin/pages/customers/Transactions";
import CustomerDetailPage from "./modules/Admin/pages/customers/CustomerDetailPage";
// Delivery Management child pages
import DeliveryBoys from "./modules/Admin/pages/delivery/DeliveryBoys";
import CashCollection from "./modules/Admin/pages/delivery/CashCollection";
import AssignDelivery from "./modules/Admin/pages/delivery/AssignDelivery";
// Vendors child pages
import Vendors from "./modules/Admin/pages/Vendors";
import ManageVendors from "./modules/Admin/pages/vendors/ManageVendors";
import PendingApprovals from "./modules/Admin/pages/vendors/PendingApprovals";
import VendorDetail from "./modules/Admin/pages/vendors/VendorDetail";
import CommissionRates from "./modules/Admin/pages/vendors/CommissionRates";
import AdminVendorAnalytics from "./modules/Admin/pages/vendors/VendorAnalytics";
import VendorSubscriptions from "./modules/Admin/pages/vendors/VendorSubscriptions";
import AdminSubscriptionPlans from "./modules/Admin/pages/SubscriptionPlans";
import AdminVendorTerms from "./modules/Admin/pages/VendorTerms";
import PayoutRequests from "./modules/Admin/pages/PayoutRequests";

// Offers & Sliders child pages
import HomeSliders from "./modules/Admin/pages/offers/HomeSliders";
import FestivalOffers from "./modules/Admin/pages/offers/FestivalOffers";
// Notifications child pages
import PushNotifications from "./modules/Admin/pages/notifications/PushNotifications";
import CustomMessages from "./modules/Admin/pages/notifications/CustomMessages";
import AllNotifications from "./modules/Admin/pages/notifications/AllNotifications";
// Support Desk child pages
import LiveChat from "./modules/Admin/pages/support/LiveChat";
import TicketTypes from "./modules/Admin/pages/support/TicketTypes";
import Tickets from "./modules/Admin/pages/support/Tickets";
import Feedbacks from "./modules/Admin/pages/Feedbacks";
// Reports child pages
import SalesReport from "./modules/Admin/pages/reports/SalesReport";
import InventoryReport from "./modules/Admin/pages/reports/InventoryReport";
// Analytics & Finance child pages
import RevenueOverview from "./modules/Admin/pages/finance/RevenueOverview";
import ProfitLoss from "./modules/Admin/pages/finance/ProfitLoss";
import OrderTrends from "./modules/Admin/pages/finance/OrderTrends";
import PaymentBreakdown from "./modules/Admin/pages/finance/PaymentBreakdown";
import TaxReports from "./modules/Admin/pages/finance/TaxReports";
import RefundReports from "./modules/Admin/pages/finance/RefundReports";
// Consolidated Settings pages
import GeneralSettings from "./modules/Admin/pages/settings/GeneralSettings";
import PaymentShippingSettings from "./modules/Admin/pages/settings/PaymentShippingSettings";
import ContentFeaturesSettings from "./modules/Admin/pages/settings/ContentFeaturesSettings";
// Policies child pages
import PrivacyPolicy from "./modules/Admin/pages/policies/PrivacyPolicy";
import RefundPolicy from "./modules/Admin/pages/policies/RefundPolicy";
import TermsConditions from "./modules/Admin/pages/policies/TermsConditions";
import AboutUs from "./modules/Admin/pages/policies/AboutUs";
import ContactUs from "./modules/Admin/pages/policies/ContactUs";
import ShippingPolicy from "./modules/Admin/pages/policies/ShippingPolicy";
import FAQs from "./modules/Admin/pages/policies/FAQs";
import BecomePartner from "./modules/Admin/pages/policies/BecomePartner";
import AdminRouteGuard from "./modules/Admin/components/AdminRouteGuard";
import SubAdmins from "./modules/Admin/pages/subadmin/SubAdmins";
import CreateSubAdmin from "./modules/Admin/pages/subadmin/CreateSubAdmin";
import EditSubAdmin from "./modules/Admin/pages/subadmin/EditSubAdmin";
import ActivityLogs from "./modules/Admin/pages/subadmin/ActivityLogs";
import RouteWrapper from "./shared/components/RouteWrapper";
import ScrollToTop from "./shared/components/ScrollToTop";
import AppBootstrap from "./shared/components/AppBootstrap";

// Mobile App Routes
import MobileHome from "./modules/UserApp/pages/Home";
import MobileProductDetail from "./modules/UserApp/pages/ProductDetail";
import MobileSeller from "./modules/UserApp/pages/Seller";
import MobileCategory from "./modules/UserApp/pages/Category";
import MobileBrand from "./modules/UserApp/pages/Brand";
import MobileCategories from "./modules/UserApp/pages/categories";
import MobileCheckout from "./modules/UserApp/pages/Checkout";
import MobileSearch from "./modules/UserApp/pages/Search";
import MobileLogin from "./modules/UserApp/pages/Login";
import MobileRegister from "./modules/UserApp/pages/Register";
import MobileVerification from "./modules/UserApp/pages/Verification";
import MobileForgotPassword from "./modules/UserApp/pages/ForgotPassword";
import MobileResetPassword from "./modules/UserApp/pages/ResetPassword";
import MobileProfile from "./modules/UserApp/pages/Profile";
import UserNotifications from "./modules/UserApp/pages/Notifications";
import MobileOrders from "./modules/UserApp/pages/Orders";
import MobileOrderDetail from "./modules/UserApp/pages/OrderDetail";
import MobileAddresses from "./modules/UserApp/pages/Addresses";
import MobileWishlist from "./modules/UserApp/pages/Wishlist";
import MobileOffers from "./modules/UserApp/pages/Offers";
import MobileDailyDeals from "./modules/UserApp/pages/DailyDeals";
import MobileFlashSale from "./modules/UserApp/pages/FlashSale";
import MobileNewArrivals from "./modules/UserApp/pages/NewArrivals";
import MobileCampaignSale from "./modules/UserApp/pages/CampaignSale";
import UserContactUs from "./modules/UserApp/pages/ContactUs";
import Feedback from "./modules/UserApp/pages/Feedback";
import MobileTrackOrder from "./modules/UserApp/pages/TrackOrder";
import MobileOrderConfirmation from "./modules/UserApp/pages/OrderConfirmation";
import ComingSoon from "./modules/UserApp/pages/ComingSoon";
import SellOnDwellmart from "./modules/UserApp/pages/SellOnDwellmart";
import ShopWithConfidence from "./modules/UserApp/pages/ShopWithConfidence";
import StaticPage from "./modules/UserApp/pages/StaticPage";
import Shop from "./modules/UserApp/pages/Shop";
import CustomerSupport from "./modules/UserApp/pages/Support";
// Delivery Routes
import DeliveryLogin from "./modules/Delivery/pages/Login";
import DeliveryRegister from "./modules/Delivery/pages/Register";
import DeliveryForgotPassword from "./modules/Delivery/pages/ForgotPassword";
import DeliveryResetPassword from "./modules/Delivery/pages/ResetPassword";
import DeliveryProtectedRoute from "./modules/Delivery/components/DeliveryProtectedRoute";
import DeliveryLayout from "./modules/Delivery/components/Layout/DeliveryLayout";
import DeliveryDashboard from "./modules/Delivery/pages/Dashboard";
import DeliveryOrders from "./modules/Delivery/pages/Orders";
import DeliveryOrderDetail from "./modules/Delivery/pages/OrderDetail";
import DeliveryProfile from "./modules/Delivery/pages/Profile";
import DeliveryNotifications from "./modules/Delivery/pages/Notifications";
import DeliverySupport from "./modules/Delivery/pages/Support";
// Vendor Routes
import VendorLogin from "./modules/Vendor/pages/Login";
import VendorRegister from "./modules/Vendor/pages/Register";
import VendorVerification from "./modules/Vendor/pages/Verification";
import VendorForgotPassword from "./modules/Vendor/pages/ForgotPassword";
import VendorResetPassword from "./modules/Vendor/pages/ResetPassword";
import VendorRenewSubscription from "./modules/Vendor/pages/VendorRenewSubscription";
import VendorProtectedRoute from "./modules/Vendor/components/VendorProtectedRoute";
import VendorActionRoute from "./modules/Vendor/components/VendorActionRoute";
import VendorLayout from "./modules/Vendor/components/Layout/VendorLayout";
import VendorDashboard from "./modules/Vendor/pages/Dashboard";
import VendorProducts from "./modules/Vendor/pages/Products";
import VendorManageProducts from "./modules/Vendor/pages/products/ManageProducts";
import VendorAddProduct from "./modules/Vendor/pages/products/AddProduct";
import VendorProductForm from "./modules/Vendor/pages/products/ProductForm";
import VendorOrders from "./modules/Vendor/pages/Orders";
import VendorAllOrders from "./modules/Vendor/pages/orders/AllOrders";
import VendorOrderTracking from "./modules/Vendor/pages/orders/OrderTracking";
import VendorOrderDetail from "./modules/Vendor/pages/orders/OrderDetail";
import VendorAnalytics from "./modules/Vendor/pages/Analytics";
import VendorEarnings from "./modules/Vendor/pages/Earnings";
import VendorSettings from "./modules/Vendor/pages/Settings";
import ProfileSettings from "./modules/Vendor/pages/settings/ProfileSettings";
import VendorStockManagement from "./modules/Vendor/pages/StockManagement";
import VendorWalletHistory from "./modules/Vendor/pages/WalletHistory";
import VendorChat from "./modules/Vendor/pages/Chat";
import VendorReturnRequests from "./modules/Vendor/pages/ReturnRequests";
import VendorReturnRequestDetail from "./modules/Vendor/pages/returns/ReturnRequestDetail";
import VendorProductReviews from "./modules/Vendor/pages/ProductReviews";
import VendorShippingManagement from "./modules/Vendor/pages/ShippingManagement";
import VendorCustomers from "./modules/Vendor/pages/Customers";
import VendorCustomerDetail from "./modules/Vendor/pages/CustomerDetail";
import VendorInventoryReports from "./modules/Vendor/pages/InventoryReports";
import VendorPerformanceMetrics from "./modules/Vendor/pages/PerformanceMetrics";
import VendorDocuments from "./modules/Vendor/pages/Documents";
import VendorNotifications from "./modules/Vendor/pages/Notifications";
import VendorSupportTickets from "./modules/Vendor/pages/SupportTickets";
import VendorPickupLocations from "./modules/Vendor/pages/PickupLocations";
import VendorReports from "./modules/Vendor/pages/Reports";
import VendorLanguageSettings from "./modules/Vendor/pages/LanguageSettings";
import VendorSubscriptionManagement from "./modules/Vendor/pages/SubscriptionManagement";
import DesignSystemShowcase from "./shared/components/ui/Showcase/DesignSystemShowcase";
import { ToastProvider } from "./shared/components/ui";

// Inner component that has access to useLocation
const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/dev/ui" element={<DesignSystemShowcase />} />
      <Route
        path="/"
        element={
          <RouteWrapper>
            <MobileHome />
          </RouteWrapper>
        }
      />
      <Route
        path="/home"
        element={
          <RouteWrapper>
            <MobileHome />
          </RouteWrapper>
        }
      />
      <Route
        path="/product/:id"
        element={
          <RouteWrapper>
            <MobileProductDetail />
          </RouteWrapper>
        }
      />
      <Route
        path="/seller/:id"
        element={
          <RouteWrapper>
            <MobileSeller />
          </RouteWrapper>
        }
      />
      <Route
        path="/category/:id"
        element={
          <RouteWrapper>
            <MobileCategory />
          </RouteWrapper>
        }
      />
      <Route
        path="/brand/:id"
        element={
          <RouteWrapper>
            <MobileBrand />
          </RouteWrapper>
        }
      />
      <Route
        path="/categories"
        element={
          <RouteWrapper>
            <MobileCategories />
          </RouteWrapper>
        }
      />
      <Route path="/shop" element={<RouteWrapper><Shop /></RouteWrapper>} />
      <Route path="/search"
        element={
          <RouteWrapper>
            <MobileSearch />
          </RouteWrapper>
        }
      />
      <Route
        path="/checkout"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <MobileCheckout />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />

      <Route
        path="/login"
        element={
          <RouteWrapper>
            <MobileLogin />
          </RouteWrapper>
        }
      />
      <Route
        path="/register"
        element={
          <RouteWrapper>
            <MobileRegister />
          </RouteWrapper>
        }
      />
      <Route
        path="/verification"
        element={
          <RouteWrapper>
            <MobileVerification />
          </RouteWrapper>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <RouteWrapper>
            <MobileForgotPassword />
          </RouteWrapper>
        }
      />
      <Route
        path="/reset-password"
        element={
          <RouteWrapper>
            <MobileResetPassword />
          </RouteWrapper>
        }
      />
      <Route
        path="/wishlist"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <MobileWishlist />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />
      <Route
        path="/offers"
        element={
          <RouteWrapper>
            <MobileOffers />
          </RouteWrapper>
        }
      />
      <Route
        path="/sell-on-dwellmart"
        element={
          <RouteWrapper>
            <SellOnDwellmart />
          </RouteWrapper>
        }
      />
      <Route
        path="/shop-with-confidence"
        element={
          <RouteWrapper>
            <ShopWithConfidence />
          </RouteWrapper>
        }
      />
      <Route
        path="/daily-deals"
        element={
          <RouteWrapper>
            <MobileDailyDeals />
          </RouteWrapper>
        }
      />
      <Route
        path="/flash-sale"
        element={
          <RouteWrapper>
            <MobileFlashSale />
          </RouteWrapper>
        }
      />
      <Route
        path="/new-arrivals"
        element={
          <RouteWrapper>
            <MobileNewArrivals />
          </RouteWrapper>
        }
      />
      <Route
        path="/sale/:slug"
        element={
          <RouteWrapper>
            <MobileCampaignSale />
          </RouteWrapper>
        }
      />
      <Route
        path="/order-confirmation/:orderId"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <MobileOrderConfirmation />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />
      <Route
        path="/orders/:orderId"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <MobileOrderDetail />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />
      <Route
        path="/track-order/:orderId"
        element={
          <RouteWrapper>
            <MobileTrackOrder />
          </RouteWrapper>
        }
      />
      <Route
        path="/profile"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <MobileProfile />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />
      <Route
        path="/notifications"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <UserNotifications />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />
      <Route
        path="/support"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <CustomerSupport />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />
      <Route
        path="/orders"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <MobileOrders />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />
      <Route
        path="/addresses"
        element={
          <RouteWrapper>
            <ProtectedRoute>
              <MobileAddresses />
            </ProtectedRoute>
          </RouteWrapper>
        }
      />
      {/* Static content pages — powered by admin-editable content */}
      <Route path="/about" element={<RouteWrapper><StaticPage slug="about" /></RouteWrapper>} />
      <Route path="/contact" element={<RouteWrapper><UserContactUs /></RouteWrapper>} />
      <Route path="/feedback" element={<RouteWrapper><Feedback /></RouteWrapper>} />
      <Route path="/terms" element={<RouteWrapper><StaticPage slug="terms" /></RouteWrapper>} />
      <Route path="/privacy" element={<RouteWrapper><StaticPage slug="privacy" /></RouteWrapper>} />
      <Route path="/returns" element={<RouteWrapper><StaticPage slug="returns" /></RouteWrapper>} />
      <Route path="/shipping" element={<RouteWrapper><StaticPage slug="shipping" /></RouteWrapper>} />
      <Route path="/faq" element={<RouteWrapper><StaticPage slug="faq" /></RouteWrapper>} />
      <Route path="/partner" element={<RouteWrapper><StaticPage slug="partner" /></RouteWrapper>} />
      {/* Admin Routes */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminRouteGuard permission="dashboard.view"><Dashboard /></AdminRouteGuard>} />
        <Route path="subadmins" element={<AdminRouteGuard requiredRole="superadmin"><SubAdmins /></AdminRouteGuard>} />
        <Route path="subadmins/logs" element={<AdminRouteGuard requiredRole="superadmin"><ActivityLogs /></AdminRouteGuard>} />
        <Route path="subadmins/create" element={<AdminRouteGuard requiredRole="superadmin"><CreateSubAdmin /></AdminRouteGuard>} />
        <Route path="subadmins/:id/edit" element={<AdminRouteGuard requiredRole="superadmin"><EditSubAdmin /></AdminRouteGuard>} />
        <Route path="products" element={<AdminRouteGuard permission="products.view"><Products /></AdminRouteGuard>} />
        <Route path="products/add-product" element={<AdminRouteGuard permission="products.add"><ProductForm /></AdminRouteGuard>} />
        <Route path="products/manage-products" element={<AdminRouteGuard permission="products.view"><ManageProducts /></AdminRouteGuard>} />
        <Route path="products/tax-pricing" element={<AdminRouteGuard permission="products.edit"><TaxPricing /></AdminRouteGuard>} />
        <Route path="products/product-ratings" element={<AdminRouteGuard permission="products.view"><ProductRatings /></AdminRouteGuard>} />
        <Route path="products/:id" element={<AdminRouteGuard permission="products.edit"><ProductForm /></AdminRouteGuard>} />
        <Route path="more" element={<AdminRouteGuard permission="dashboard.view"><More /></AdminRouteGuard>} />
        <Route path="categories" element={<AdminRouteGuard permission="categories.view"><Categories /></AdminRouteGuard>} />
        <Route
          path="categories/manage-categories"
          element={<AdminRouteGuard permission="categories.view"><ManageCategories /></AdminRouteGuard>}
        />
        <Route path="categories/category-order" element={<AdminRouteGuard permission="categories.edit"><CategoryOrder /></AdminRouteGuard>} />
        <Route path="brands" element={<AdminRouteGuard permission="categories.view"><Brands /></AdminRouteGuard>} />
        <Route path="brands/manage-brands" element={<AdminRouteGuard permission="categories.view"><ManageBrands /></AdminRouteGuard>} />
        <Route path="orders" element={<AdminRouteGuard permission="orders.view"><AdminOrders /></AdminRouteGuard>} />
        <Route path="orders/:id" element={<AdminRouteGuard permission="orders.view"><OrderDetail /></AdminRouteGuard>} />
        <Route path="orders/:id/invoice" element={<AdminRouteGuard permission="orders.view"><Invoice /></AdminRouteGuard>} />
        <Route path="orders/all-orders" element={<AdminRouteGuard permission="orders.view"><AllOrders /></AdminRouteGuard>} />
        <Route path="orders/order-tracking" element={<AdminRouteGuard permission="orders.view"><OrderTracking /></AdminRouteGuard>} />
        <Route path="return-requests" element={<AdminRouteGuard permission="orders.view"><ReturnRequests /></AdminRouteGuard>} />
        <Route path="return-requests/:id" element={<AdminRouteGuard permission="orders.view"><ReturnRequestDetail /></AdminRouteGuard>} />
        <Route path="customers" element={<AdminRouteGuard permission="users.view"><Customers /></AdminRouteGuard>} />
        <Route path="customers/view-customers" element={<AdminRouteGuard permission="users.view"><ViewCustomers /></AdminRouteGuard>} />
        <Route path="customers/addresses" element={<AdminRouteGuard permission="users.view"><CustomerAddresses /></AdminRouteGuard>} />
        <Route path="customers/transactions" element={<AdminRouteGuard permission="users.view"><Transactions /></AdminRouteGuard>} />
        <Route path="customers/:id" element={<AdminRouteGuard permission="users.view"><CustomerDetailPage /></AdminRouteGuard>} />

        <Route path="delivery" element={<AdminRouteGuard permission="delivery.view"><DeliveryBoys /></AdminRouteGuard>} />
        <Route path="delivery/delivery-boys" element={<AdminRouteGuard permission="delivery.view"><DeliveryBoys /></AdminRouteGuard>} />
        <Route path="delivery/cash-collection" element={<AdminRouteGuard permission="delivery.edit"><CashCollection /></AdminRouteGuard>} />
        <Route path="delivery/assign-delivery" element={<AdminRouteGuard permission="delivery.approve"><AssignDelivery /></AdminRouteGuard>} />
        <Route path="vendors" element={<AdminRouteGuard permission="vendors.view"><Vendors /></AdminRouteGuard>} />
        <Route path="vendors/manage-vendors" element={<AdminRouteGuard permission="vendors.view"><ManageVendors /></AdminRouteGuard>} />
        <Route
          path="vendors/pending-approvals"
          element={<AdminRouteGuard permission="vendors.approve"><PendingApprovals /></AdminRouteGuard>}
        />
        <Route path="vendors/commission-rates" element={<AdminRouteGuard permission="vendors.edit"><CommissionRates /></AdminRouteGuard>} />
        <Route
          path="vendors/vendor-analytics"
          element={<AdminRouteGuard permission="vendors.view"><AdminVendorAnalytics /></AdminRouteGuard>}
        />
        <Route
          path="vendors/vendor-subscriptions"
          element={<AdminRouteGuard permission="vendors.view"><VendorSubscriptions /></AdminRouteGuard>}
        />
        <Route path="vendors/:id" element={<AdminRouteGuard permission="vendors.view"><VendorDetail /></AdminRouteGuard>} />
        <Route path="vendors/payout-requests" element={<AdminRouteGuard permission="vendors.approve"><PayoutRequests /></AdminRouteGuard>} />

        <Route path="subscription-plans" element={<AdminRouteGuard permission="vendors.view"><AdminSubscriptionPlans /></AdminRouteGuard>} />
        <Route path="vendor-terms" element={<AdminRouteGuard permission="vendors.view"><AdminVendorTerms /></AdminRouteGuard>} />

        <Route path="offers" element={<HomeSliders />} />
        <Route path="offers/home-sliders" element={<HomeSliders />} />
        <Route path="offers/festival-offers" element={<FestivalOffers />} />
        <Route path="promocodes" element={<PromoCodes />} />
        <Route path="notifications" element={<AllNotifications />} />
        <Route
          path="notifications/push-notifications"
          element={<PushNotifications />}
        />
        <Route
          path="notifications/custom-messages"
          element={<CustomMessages />}
        />
        <Route path="support" element={<Tickets />} />
        <Route path="support/live-chat" element={<LiveChat />} />
        <Route path="support/ticket-types" element={<TicketTypes />} />
        <Route path="support/tickets" element={<Tickets />} />
        <Route path="support/feedbacks" element={<AdminRouteGuard permission="support.view"><Feedbacks /></AdminRouteGuard>} />
        <Route path="reports" element={<SalesReport />} />
        <Route path="reports/sales-report" element={<SalesReport />} />
        <Route path="reports/inventory-report" element={<InventoryReport />} />
        <Route path="finance" element={<RevenueOverview />} />
        <Route path="finance/revenue-overview" element={<RevenueOverview />} />
        <Route path="finance/profit-loss" element={<ProfitLoss />} />
        <Route path="finance/order-trends" element={<OrderTrends />} />
        <Route
          path="finance/payment-breakdown"
          element={<PaymentBreakdown />}
        />
        <Route path="finance/tax-reports" element={<TaxReports />} />
        <Route path="finance/refund-reports" element={<RefundReports />} />
        <Route path="analytics" element={<Analytics />} />
        <Route
          path="settings"
          element={<Navigate to="/admin/settings/general" replace />}
        />
        <Route path="settings/general" element={<Settings />} />
        <Route path="settings/payment-shipping" element={<Settings />} />
        <Route path="settings/content-features" element={<Settings />} />
        <Route path="policies" element={<PrivacyPolicy />} />
        <Route path="policies/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="policies/refund-policy" element={<RefundPolicy />} />
        <Route path="policies/terms-conditions" element={<TermsConditions />} />
        <Route path="policies/about-us" element={<AboutUs />} />
        <Route path="policies/contact-us" element={<ContactUs />} />
        <Route path="policies/shipping-policy" element={<ShippingPolicy />} />
        <Route path="policies/faqs" element={<FAQs />} />
        <Route path="policies/become-partner" element={<BecomePartner />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="banners" element={<Banners />} />
        <Route path="testimonials" element={<Testimonials />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="content" element={<Content />} />
      </Route>
      {/* Delivery Routes */}
      <Route path="/delivery/login" element={<DeliveryLogin />} />
      <Route path="/delivery/register" element={<DeliveryRegister />} />
      <Route
        path="/delivery/forgot-password"
        element={<DeliveryForgotPassword />}
      />
      <Route
        path="/delivery/reset-password"
        element={<DeliveryResetPassword />}
      />
      <Route
        path="/delivery"
        element={
          <DeliveryProtectedRoute>
            <DeliveryLayout />
          </DeliveryProtectedRoute>
        }>
        <Route index element={<Navigate to="/delivery/dashboard" replace />} />
        <Route path="dashboard" element={<DeliveryDashboard />} />
        <Route path="orders" element={<DeliveryOrders />} />
        <Route path="orders/:id" element={<DeliveryOrderDetail />} />
        <Route path="notifications" element={<DeliveryNotifications />} />
        <Route path="support" element={<DeliverySupport />} />
        <Route path="profile" element={<DeliveryProfile />} />
      </Route>
      {/* Vendor Routes */}
      <Route path="/vendor/login" element={<VendorLogin />} />
      <Route path="/vendor/register" element={<VendorRegister />} />
      <Route path="/vendor/verification" element={<VendorVerification />} />
      <Route
        path="/vendor/forgot-password"
        element={<VendorForgotPassword />}
      />
      <Route path="/vendor/reset-password" element={<VendorResetPassword />} />
      {/* Renewal page — outside VendorProtectedRoute so expired vendors can access it */}
      <Route path="/vendor/renew-subscription" element={<VendorRenewSubscription />} />
      <Route
        path="/vendor"
        element={
          <VendorProtectedRoute>
            <VendorLayout />
          </VendorProtectedRoute>
        }>
        <Route index element={<Navigate to="/vendor/dashboard" replace />} />
        <Route path="dashboard" element={<VendorDashboard />} />
        <Route path="products" element={<VendorProducts />} />
        <Route
          path="products/manage-products"
          element={<VendorManageProducts />}
        />
        <Route
          path="products/add-product"
          element={
            <VendorActionRoute>
              <VendorAddProduct />
            </VendorActionRoute>
          }
        />
        <Route
          path="products/:id"
          element={
            <VendorActionRoute>
              <VendorProductForm />
            </VendorActionRoute>
          }
        />
        <Route path="orders" element={<VendorOrders />} />
        <Route path="orders/all-orders" element={<VendorAllOrders />} />
        <Route path="orders/order-tracking" element={<VendorOrderTracking />} />
        <Route path="orders/:id" element={<VendorOrderDetail />} />
        <Route path="analytics" element={<VendorAnalytics />} />
        <Route path="reports" element={<VendorReports />} />
        <Route path="earnings" element={<VendorEarnings />} />
        <Route path="earnings/overview" element={<VendorEarnings />} />
        <Route
          path="earnings/commission-history"
          element={<VendorEarnings />}
        />
        <Route
          path="earnings/settlement-history"
          element={<VendorEarnings />}
        />
        <Route path="stock-management" element={<VendorStockManagement />} />
        <Route path="wallet-history" element={<VendorWalletHistory />} />
        <Route path="subscription" element={<VendorSubscriptionManagement />} />
        <Route path="subscriptions" element={<VendorSubscriptionManagement />} />
        <Route path="chat" element={<VendorChat />} />
        <Route path="notifications" element={<VendorNotifications />} />
        <Route path="return-requests" element={<VendorReturnRequests />} />
        <Route
          path="return-requests/:id"
          element={<VendorReturnRequestDetail />}
        />
        <Route path="product-reviews" element={<VendorProductReviews />} />
        <Route
          path="shipping-management"
          element={<VendorShippingManagement />}
        />
        <Route path="pickup-locations" element={<VendorPickupLocations />} />
        <Route path="customers/:id" element={<VendorCustomerDetail />} />
        <Route path="customers" element={<VendorCustomers />} />
        <Route path="support-tickets" element={<VendorSupportTickets />} />
        <Route path="chat" element={<Navigate to="/vendor/support-tickets" replace />} />
        <Route path="inventory-reports" element={<VendorInventoryReports />} />
        <Route
          path="performance-metrics"
          element={<VendorPerformanceMetrics />}
        />
        <Route path="language-settings" element={<VendorLanguageSettings />} />
        <Route path="settings" element={<VendorSettings />} />
        <Route path="settings/store" element={<VendorSettings />} />
        <Route path="settings/payment" element={<VendorSettings />} />
        <Route path="settings/payment-settings" element={<VendorSettings />} />
        <Route path="settings/shipping" element={<VendorSettings />} />
        <Route path="settings/shipping-settings" element={<VendorSettings />} />
        <Route path="profile" element={<ProfileSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ThemeProvider defaultThemeId="default">
      <ToastProvider position="top-right" maxToasts={5}>
        <ErrorBoundary>
          <Router
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <AppBootstrap />
            <ScrollToTop />
            <AppRoutes />
            <CartDrawer />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: {
                  background: "#212121",
                  color: "#fff",
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: "#388E3C",
                    secondary: "#fff",
                  },
                },
                error: {
                  duration: 4000,
                  iconTheme: {
                    primary: "#FF6161",
                    secondary: "#fff",
                  },
                },
              }}
            />
          </Router>
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
