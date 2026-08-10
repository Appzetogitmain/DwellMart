import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./theme";
import { lazy, Suspense } from "react";

import CartDrawer from "./shared/components/Cart/CartDrawer";
import ProtectedRoute from "./shared/components/Auth/ProtectedRoute";
import ErrorBoundary from "./shared/components/ErrorBoundary/ErrorBoundary";
import { ToastProvider } from "./shared/components/ui/Toast";
import AdminLogin from "./modules/Admin/pages/Login";
// ─── Admin module — lazy (large chunk, only loaded after /admin/login) ────────
const AdminProtectedRoute = lazy(() => import("./modules/Admin/components/AdminProtectedRoute"));
const AdminLayout = lazy(() => import("./modules/Admin/components/Layout/AdminLayout"));
const Dashboard = lazy(() => import("./modules/Admin/pages/Dashboard"));
const Products = lazy(() => import("./modules/Admin/pages/Products"));
const ProductForm = lazy(() => import("./modules/Admin/pages/ProductForm"));
const AdminOrders = lazy(() => import("./modules/Admin/pages/Orders"));
const OrderDetail = lazy(() => import("./modules/Admin/pages/OrderDetail"));
const ReturnRequests = lazy(() => import("./modules/Admin/pages/ReturnRequests"));
const ReturnRequestDetail = lazy(() => import("./modules/Admin/pages/ReturnRequestDetail"));
const Categories = lazy(() => import("./modules/Admin/pages/Categories"));
const Brands = lazy(() => import("./modules/Admin/pages/Brands"));
const Customers = lazy(() => import("./modules/Admin/pages/Customers"));
const Campaigns = lazy(() => import("./modules/Admin/pages/Campaigns"));
const Banners = lazy(() => import("./modules/Admin/pages/Banners"));
const Testimonials = lazy(() => import("./modules/Admin/pages/Testimonials"));
const Reviews = lazy(() => import("./modules/Admin/pages/Reviews"));
const Analytics = lazy(() => import("./modules/Admin/pages/Analytics"));
const Content = lazy(() => import("./modules/Admin/pages/Content"));
const Settings = lazy(() => import("./modules/Admin/pages/Settings"));
const More = lazy(() => import("./modules/Admin/pages/More"));
const PromoCodes = lazy(() => import("./modules/Admin/pages/PromoCodes"));
// Orders child pages
const AllOrders = lazy(() => import("./modules/Admin/pages/orders/AllOrders"));
const OrderTracking = lazy(() => import("./modules/Admin/pages/orders/OrderTracking"));
const Invoice = lazy(() => import("./modules/Admin/pages/orders/Invoice"));
// Products child pages
const ManageProducts = lazy(() => import("./modules/Admin/pages/products/ManageProducts"));
const TaxPricing = lazy(() => import("./modules/Admin/pages/products/TaxPricing"));
const ProductRatings = lazy(() => import("./modules/Admin/pages/products/ProductRatings"));
// Categories child pages
const ManageCategories = lazy(() => import("./modules/Admin/pages/categories/ManageCategories"));
const CategoryOrder = lazy(() => import("./modules/Admin/pages/categories/CategoryOrder"));
// Brands child pages
const ManageBrands = lazy(() => import("./modules/Admin/pages/brands/ManageBrands"));
// Customers child pages
const ViewCustomers = lazy(() => import("./modules/Admin/pages/customers/ViewCustomers"));
const CustomerAddresses = lazy(() => import("./modules/Admin/pages/customers/Addresses"));
const Transactions = lazy(() => import("./modules/Admin/pages/customers/Transactions"));
const CustomerDetailPage = lazy(() => import("./modules/Admin/pages/customers/CustomerDetailPage"));
// Delivery Management child pages
const DeliveryBoys = lazy(() => import("./modules/Admin/pages/delivery/DeliveryBoys"));
const CashCollection = lazy(() => import("./modules/Admin/pages/delivery/CashCollection"));
const AssignDelivery = lazy(() => import("./modules/Admin/pages/delivery/AssignDelivery"));
const QuickCommerceOperations = lazy(() => import("./modules/Admin/pages/QuickCommerceOperations"));
const QuickCommerceSettings = lazy(() => import("./modules/Admin/pages/settings/QuickCommerceSettings"));
// Vendors child pages
const Vendors = lazy(() => import("./modules/Admin/pages/Vendors"));
const ManageVendors = lazy(() => import("./modules/Admin/pages/vendors/ManageVendors"));
const PendingApprovals = lazy(() => import("./modules/Admin/pages/vendors/PendingApprovals"));
const VendorDetail = lazy(() => import("./modules/Admin/pages/vendors/VendorDetail"));
const CommissionRates = lazy(() => import("./modules/Admin/pages/vendors/CommissionRates"));
const AdminVendorAnalytics = lazy(() => import("./modules/Admin/pages/vendors/VendorAnalytics"));
const AdminQuickCommerceAnalytics = lazy(() => import("./modules/Admin/pages/QuickCommerceAnalytics"));
const VendorSubscriptions = lazy(() => import("./modules/Admin/pages/vendors/VendorSubscriptions"));
const AdminSubscriptionPlans = lazy(() => import("./modules/Admin/pages/SubscriptionPlans"));
const AdminVendorTerms = lazy(() => import("./modules/Admin/pages/VendorTerms"));
const PayoutRequests = lazy(() => import("./modules/Admin/pages/PayoutRequests"));
// Offers & Sliders child pages
const HomeSliders = lazy(() => import("./modules/Admin/pages/offers/HomeSliders"));
const FestivalOffers = lazy(() => import("./modules/Admin/pages/offers/FestivalOffers"));
// Notifications child pages
const PushNotifications = lazy(() => import("./modules/Admin/pages/notifications/PushNotifications"));
const CustomMessages = lazy(() => import("./modules/Admin/pages/notifications/CustomMessages"));
const AllNotifications = lazy(() => import("./modules/Admin/pages/notifications/AllNotifications"));
// Support Desk child pages
const LiveChat = lazy(() => import("./modules/Admin/pages/support/LiveChat"));
const TicketTypes = lazy(() => import("./modules/Admin/pages/support/TicketTypes"));
const Tickets = lazy(() => import("./modules/Admin/pages/support/Tickets"));
const Feedbacks = lazy(() => import("./modules/Admin/pages/Feedbacks"));
// Reports child pages
const SalesReport = lazy(() => import("./modules/Admin/pages/reports/SalesReport"));
const InventoryReport = lazy(() => import("./modules/Admin/pages/reports/InventoryReport"));
// Analytics & Finance child pages
const RevenueOverview = lazy(() => import("./modules/Admin/pages/finance/RevenueOverview"));
const ProfitLoss = lazy(() => import("./modules/Admin/pages/finance/ProfitLoss"));
const OrderTrends = lazy(() => import("./modules/Admin/pages/finance/OrderTrends"));
const PaymentBreakdown = lazy(() => import("./modules/Admin/pages/finance/PaymentBreakdown"));
const TaxReports = lazy(() => import("./modules/Admin/pages/finance/TaxReports"));
const RefundReports = lazy(() => import("./modules/Admin/pages/finance/RefundReports"));
// Consolidated Settings pages
const GeneralSettings = lazy(() => import("./modules/Admin/pages/settings/GeneralSettings"));
const PaymentShippingSettings = lazy(() => import("./modules/Admin/pages/settings/PaymentShippingSettings"));
const ContentFeaturesSettings = lazy(() => import("./modules/Admin/pages/settings/ContentFeaturesSettings"));
// Policies child pages
const PrivacyPolicy = lazy(() => import("./modules/Admin/pages/policies/PrivacyPolicy"));
const RefundPolicy = lazy(() => import("./modules/Admin/pages/policies/RefundPolicy"));
const TermsConditions = lazy(() => import("./modules/Admin/pages/policies/TermsConditions"));
const AboutUs = lazy(() => import("./modules/Admin/pages/policies/AboutUs"));
const ContactUs = lazy(() => import("./modules/Admin/pages/policies/ContactUs"));
const ShippingPolicy = lazy(() => import("./modules/Admin/pages/policies/ShippingPolicy"));
const FAQs = lazy(() => import("./modules/Admin/pages/policies/FAQs"));
const BecomePartner = lazy(() => import("./modules/Admin/pages/policies/BecomePartner"));
const AdminRouteGuard = lazy(() => import("./modules/Admin/components/AdminRouteGuard"));
const SubAdmins = lazy(() => import("./modules/Admin/pages/subadmin/SubAdmins"));
const CreateSubAdmin = lazy(() => import("./modules/Admin/pages/subadmin/CreateSubAdmin"));
const EditSubAdmin = lazy(() => import("./modules/Admin/pages/subadmin/EditSubAdmin"));
const ActivityLogs = lazy(() => import("./modules/Admin/pages/subadmin/ActivityLogs"));
import RouteWrapper from "./shared/components/RouteWrapper";
import ScrollToTop from "./shared/components/ScrollToTop";
import AppBootstrap from "./shared/components/AppBootstrap";

// Mobile App Routes
import MobileHome from "./modules/UserApp/pages/Home";
import QuickCommerceHome from "./modules/UserApp/pages/QuickCommerceHome";
import QuickCommerceCategoriesPage from "./modules/UserApp/pages/QuickCommerceCategoriesPage";
import MobileProductDetail from "./modules/UserApp/pages/ProductDetail";
import MobileSeller from "./modules/UserApp/pages/Seller";
import MobileSellers from "./modules/UserApp/pages/Sellers";
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
import NotificationsPage from "./modules/UserApp/pages/NotificationsPage";
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
// ─── Delivery Routes — auth pages eager, app pages lazy ─────────────────────
import DeliveryLogin from "./modules/Delivery/pages/Login";
import DeliveryRegister from "./modules/Delivery/pages/Register";
import DeliveryForgotPassword from "./modules/Delivery/pages/ForgotPassword";
import DeliveryResetPassword from "./modules/Delivery/pages/ResetPassword";
const DeliveryProtectedRoute = lazy(() => import("./modules/Delivery/components/DeliveryProtectedRoute"));
const DeliveryLayout = lazy(() => import("./modules/Delivery/components/Layout/DeliveryLayout"));
const DeliveryDashboard = lazy(() => import("./modules/Delivery/pages/Dashboard"));
const DeliveryOrders = lazy(() => import("./modules/Delivery/pages/Orders"));
const DeliveryOrderDetail = lazy(() => import("./modules/Delivery/pages/OrderDetail"));
const DeliveryProfile = lazy(() => import("./modules/Delivery/pages/Profile"));
const DeliveryNotifications = lazy(() => import("./modules/Delivery/pages/Notifications"));
const DeliverySupport = lazy(() => import("./modules/Delivery/pages/Support"));
// ─── Vendor Routes — auth pages eager, app pages lazy ────────────────────────
import VendorLogin from "./modules/Vendor/pages/Login";
import VendorRegister from "./modules/Vendor/pages/Register";
import VendorVerification from "./modules/Vendor/pages/Verification";
import VendorForgotPassword from "./modules/Vendor/pages/ForgotPassword";
import VendorResetPassword from "./modules/Vendor/pages/ResetPassword";
import VendorRenewSubscription from "./modules/Vendor/pages/VendorRenewSubscription";
const VendorProtectedRoute = lazy(() => import("./modules/Vendor/components/VendorProtectedRoute"));
const VendorActionRoute = lazy(() => import("./modules/Vendor/components/VendorActionRoute"));
const VendorLayout = lazy(() => import("./modules/Vendor/components/Layout/VendorLayout"));
const VendorDashboard = lazy(() => import("./modules/Vendor/pages/Dashboard"));
const VendorProducts = lazy(() => import("./modules/Vendor/pages/Products"));
const VendorManageProducts = lazy(() => import("./modules/Vendor/pages/products/ManageProducts"));
const VendorAddProduct = lazy(() => import("./modules/Vendor/pages/products/AddProduct"));
const VendorProductForm = lazy(() => import("./modules/Vendor/pages/products/ProductForm"));
const VendorOrders = lazy(() => import("./modules/Vendor/pages/Orders"));
const VendorAllOrders = lazy(() => import("./modules/Vendor/pages/orders/AllOrders"));
const VendorOrderTracking = lazy(() => import("./modules/Vendor/pages/orders/OrderTracking"));
const VendorOrderDetail = lazy(() => import("./modules/Vendor/pages/orders/OrderDetail"));
const VendorAnalytics = lazy(() => import("./modules/Vendor/pages/Analytics"));
const VendorQuickCommerceDashboard = lazy(() => import("./modules/Vendor/pages/QuickCommerceDashboard"));
const VendorEarnings = lazy(() => import("./modules/Vendor/pages/Earnings"));
const VendorSettings = lazy(() => import("./modules/Vendor/pages/Settings"));
const ProfileSettings = lazy(() => import("./modules/Vendor/pages/settings/ProfileSettings"));
const VendorStockManagement = lazy(() => import("./modules/Vendor/pages/StockManagement"));
const VendorWalletHistory = lazy(() => import("./modules/Vendor/pages/WalletHistory"));
const VendorChat = lazy(() => import("./modules/Vendor/pages/Chat"));
const VendorReturnRequests = lazy(() => import("./modules/Vendor/pages/ReturnRequests"));
const VendorReturnRequestDetail = lazy(() => import("./modules/Vendor/pages/returns/ReturnRequestDetail"));
const VendorProductReviews = lazy(() => import("./modules/Vendor/pages/ProductReviews"));
const VendorShippingManagement = lazy(() => import("./modules/Vendor/pages/ShippingManagement"));
const VendorCustomers = lazy(() => import("./modules/Vendor/pages/Customers"));
const VendorCustomerDetail = lazy(() => import("./modules/Vendor/pages/CustomerDetail"));
const VendorInventoryReports = lazy(() => import("./modules/Vendor/pages/InventoryReports"));
const VendorPerformanceMetrics = lazy(() => import("./modules/Vendor/pages/PerformanceMetrics"));
const VendorDocuments = lazy(() => import("./modules/Vendor/pages/Documents"));
const VendorNotifications = lazy(() => import("./modules/Vendor/pages/Notifications"));
const VendorSupportTickets = lazy(() => import("./modules/Vendor/pages/SupportTickets"));
const VendorPickupLocations = lazy(() => import("./modules/Vendor/pages/PickupLocations"));
const VendorReports = lazy(() => import("./modules/Vendor/pages/Reports"));
const VendorLanguageSettings = lazy(() => import("./modules/Vendor/pages/LanguageSettings"));
const VendorSubscriptionManagement = lazy(() => import("./modules/Vendor/pages/SubscriptionManagement"));
const RequireCapability = lazy(() => import("./modules/Vendor/components/RequireCapability"));
const DesignSystemShowcase = lazy(() => import("./shared/components/ui/Showcase/DesignSystemShowcase"));

import { useSettingsStore } from "./shared/store/settingsStore";

// ─── Shared chunk-loading fallback ────────────────────────────────────────────
// Shown while any lazy-loaded chunk is downloading. Minimal so it renders
// before the chunk is ready without needing any chunk itself.
const PageLoader = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
  </div>
);

const QuickCommerceRoute = ({ children }) => {
  const { settings } = useSettingsStore();
  const quickCommerceEnabled = settings?.features?.quickCommerceEnabled === true;
  if (!quickCommerceEnabled) {
    return <Navigate to="/home" replace />;
  }
  return children;
};

// Inner component that has access to useLocation
const AppRoutes = () => {
  return (
    // C9: Suspense catches lazy-chunk loading; ErrorBoundary catches chunk
    // download failures so the user sees a friendly message, not a blank page.
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
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
        path="/quick"
        element={
          <RouteWrapper>
            <QuickCommerceRoute>
              <QuickCommerceHome />
            </QuickCommerceRoute>
          </RouteWrapper>
        }
      />
      <Route
        path="/quick/categories"
        element={
          <RouteWrapper>
            <QuickCommerceRoute>
              <QuickCommerceCategoriesPage />
            </QuickCommerceRoute>
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
        path="/store/:id"
        element={
          <RouteWrapper>
            <MobileSeller />
          </RouteWrapper>
        }
      />
      <Route
        path="/sellers"
        element={
          <RouteWrapper>
            <MobileSellers />
          </RouteWrapper>
        }
      />
      <Route path="/vendors" element={<Navigate to="/sellers" replace />} />
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
              <NotificationsPage />
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
        <Route path="vendors/vendor-subscriptions" element={<AdminRouteGuard permission="vendors.view"><VendorSubscriptions /></AdminRouteGuard>} />
        <Route path="vendors/payout-requests" element={<AdminRouteGuard permission="vendors.approve"><PayoutRequests /></AdminRouteGuard>} />
        <Route path="vendors/:id" element={<AdminRouteGuard permission="vendors.view"><VendorDetail /></AdminRouteGuard>} />

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
          path="analytics/quick-commerce"
          element={<AdminRouteGuard permission="quickcommerce.analytics.view"><AdminQuickCommerceAnalytics /></AdminRouteGuard>}
        />
        <Route
          path="quick-commerce/operations"
          element={<AdminRouteGuard permission="quickcommerce.orders.manage"><QuickCommerceOperations /></AdminRouteGuard>}
        />
        <Route
          path="settings/quick-commerce"
          element={<AdminRouteGuard permission="quickcommerce.settings.manage"><QuickCommerceSettings /></AdminRouteGuard>}
        />
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
        <Route path="analytics" element={<RequireCapability feature="analytics"><VendorAnalytics /></RequireCapability>} />
        <Route path="quick-commerce" element={<VendorQuickCommerceDashboard />} />
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
        <Route path="stock-management" element={<RequireCapability feature="inventory"><VendorStockManagement /></RequireCapability>} />
        <Route path="wallet-history" element={<VendorWalletHistory />} />
        <Route path="subscription" element={<VendorSubscriptionManagement />} />
        <Route path="subscriptions" element={<VendorSubscriptionManagement />} />
        <Route path="chat" element={<VendorChat />} />
        <Route path="notifications" element={<VendorNotifications />} />
        <Route path="return-requests" element={<RequireCapability feature="returns"><VendorReturnRequests /></RequireCapability>} />
        <Route
          path="return-requests/:id"
          element={<RequireCapability feature="returns"><VendorReturnRequestDetail /></RequireCapability>}
        />
        <Route path="product-reviews" element={<RequireCapability feature="reviews"><VendorProductReviews /></RequireCapability>} />
        <Route
          path="shipping-management"
          element={<VendorShippingManagement />}
        />
        <Route path="pickup-locations" element={<VendorPickupLocations />} />
        <Route path="customers/:id" element={<RequireCapability feature="customers"><VendorCustomerDetail /></RequireCapability>} />
        <Route path="customers" element={<RequireCapability feature="customers"><VendorCustomers /></RequireCapability>} />
        <Route path="support-tickets" element={<VendorSupportTickets />} />
        <Route path="chat" element={<Navigate to="/vendor/support-tickets" replace />} />
        <Route path="inventory-reports" element={<RequireCapability feature="inventory"><VendorInventoryReports /></RequireCapability>} />
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
      </Suspense>
    </ErrorBoundary>
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
              containerStyle={{
                top: 76,
                left: 12,
                right: 12,
                zIndex: 99999,
              }}
              toastOptions={{
                duration: 3000,
                style: {
                  background: "#212121",
                  color: "#fff",
                  maxWidth: "calc(100vw - 24px)",
                  wordBreak: "break-word",
                  fontSize: "14px",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
                  borderRadius: "12px",
                  padding: "12px 16px",
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
