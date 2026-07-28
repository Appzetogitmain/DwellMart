import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiUsers,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiDollarSign,
  FiBarChart2,
} from "react-icons/fi";

const Vendors = () => {
  const navigate = useNavigate();

  const menuItems = [
    {
      path: "/admin/vendors/manage-vendors",
      label: "Manage Vendors",
      icon: FiUsers,
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      lightGradient: "from-blue-50 via-blue-100/80 to-blue-50",
      shadowColor: "shadow-blue-500/20",
      hoverShadow: "hover:shadow-blue-500/30",
      description: "View and manage all vendors",
    },
    {
      path: "/admin/vendors/pending-approvals",
      label: "Pending Approvals",
      icon: FiClock,
      gradient: "from-yellow-500 via-yellow-600 to-yellow-700",
      lightGradient: "from-yellow-50 via-yellow-100/80 to-yellow-50",
      shadowColor: "shadow-yellow-500/20",
      hoverShadow: "hover:shadow-yellow-500/30",
      description: "Review pending vendor registrations",
    },
    {
      path: "/admin/vendors/commission-rates",
      label: "Commission Rates",
      icon: FiDollarSign,
      gradient: "from-green-500 via-green-600 to-green-700",
      lightGradient: "from-green-50 via-green-100/80 to-green-50",
      shadowColor: "shadow-green-500/20",
      hoverShadow: "hover:shadow-green-500/30",
      description: "Manage vendor commission rates",
    },
    {
      path: "/admin/vendors/vendor-analytics",
      label: "Vendor Analytics",
      icon: FiBarChart2,
      gradient: "from-purple-500 via-purple-600 to-purple-700",
      lightGradient: "from-purple-50 via-purple-100/80 to-purple-50",
      shadowColor: "shadow-purple-500/20",
      hoverShadow: "hover:shadow-purple-500/30",
      description: "View vendor performance analytics",
    },
    {
      path: "/admin/vendors/payout-requests",
      label: "Payout Requests",
      icon: FiClock,
      gradient: "from-orange-500 via-orange-600 to-orange-700",
      lightGradient: "from-orange-50 via-orange-100/80 to-orange-50",
      shadowColor: "shadow-orange-500/20",
      hoverShadow: "hover:shadow-orange-500/30",
      description: "Review vendor payout requests",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 sm:space-y-6"
    >
      {/* Header */}
      <div className="px-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1.5">
          Vendors
        </h1>
        <p className="text-sm sm:text-base text-gray-500">
          Manage vendors, approvals, and commission rates
        </p>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                delay: index * 0.05,
                type: "spring",
                stiffness: 200,
                damping: 20,
              }}
              onClick={() => navigate(item.path)}
              className="group relative overflow-hidden"
            >
              <div
                className={`
                relative h-full
                flex flex-col items-center justify-center
                p-3 sm:p-6
                bg-white
                rounded-2xl sm:rounded-3xl
                border border-gray-100/80
                ${`bg-gradient-to-br ${item.lightGradient}`}
                ${item.shadowColor} ${item.hoverShadow}
                shadow-md sm:shadow-lg hover:shadow-2xl
                transition-all duration-500 ease-out
                active:scale-[0.96]
                hover:border-transparent
                overflow-hidden
              `}
              >
                {/* Animated Background Gradient */}
                <div
                  className={`
                  absolute inset-0
                  bg-gradient-to-br ${item.gradient}
                  opacity-0 group-hover:opacity-10
                  transition-opacity duration-500
                `}
                />

                {/* Decorative Circles */}
                <div className="absolute -top-6 -right-6 sm:-top-8 sm:-right-8 w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -bottom-4 -left-4 sm:-bottom-6 sm:-left-6 w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-white/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                {/* Icon Container with Enhanced Design */}
                <div
                  className={`
                  relative z-10
                  w-12 h-12 sm:w-20 sm:h-20
                  rounded-xl sm:rounded-3xl
                  bg-gradient-to-br ${item.gradient}
                  flex items-center justify-center
                  mb-2 sm:mb-4
                  ${item.shadowColor}
                  shadow-lg sm:shadow-xl group-hover:shadow-2xl
                  group-hover:scale-110 group-hover:rotate-3
                  transition-all duration-500 ease-out
                  before:absolute before:inset-0
                  before:bg-gradient-to-br before:from-white/20 before:to-transparent
                  before:rounded-xl sm:before:rounded-3xl
                `}
                >
                  <Icon
                    className="text-white text-lg sm:text-3xl relative z-10"
                    strokeWidth={2.5}
                  />

                  {/* Shine Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-xl sm:rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>

                {/* Content */}
                <div className="relative z-10 text-center space-y-0.5 sm:space-y-1">
                  <h3 className="text-xs sm:text-base font-bold text-gray-900 group-hover:text-gray-950 transition-colors duration-300 leading-tight">
                    {item.label}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 group-hover:text-gray-600 transition-colors duration-300 leading-tight">
                    {item.description}
                  </p>
                </div>

                {/* Bottom Accent Line */}
                <div
                  className={`
                  absolute bottom-0 left-0 right-0
                  h-0.5 sm:h-1
                  bg-gradient-to-r ${item.gradient}
                  transform scale-x-0 group-hover:scale-x-100
                  transition-transform duration-500 ease-out
                  origin-left
                `}
                />
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default Vendors;

