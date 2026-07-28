import { motion } from "framer-motion";
import { FiStar } from "react-icons/fi";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";

const normalizeRating = (value) => {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 5;
  return Math.min(5, Math.max(1, Math.round(rating)));
};

const DEFAULT_TESTIMONIALS = [
  {
    id: "test-1",
    name: "Rahul Sharma",
    designation: "Verified Buyer",
    company: "Mumbai",
    rating: 5,
    message: "Ordered running shoes from a verified seller. Delivered within 24 hours in pristine original packaging! Exceptional marketplace service.",
    image: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "test-2",
    name: "Priya Patel",
    designation: "Verified Buyer",
    company: "Bengaluru",
    rating: 5,
    message: "The vendor response rate and product authenticity are top notch. Easy 7-day returns gave me total confidence.",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "test-3",
    name: "Ananya Iyer",
    designation: "Verified Buyer",
    company: "Delhi NCR",
    rating: 5,
    message: "DwellMart makes supporting verified independent vendors seamless. Fantastic prices, genuine products, and instant tracking updates.",
    image: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80"
  }
];

const TestimonialsSection = ({ testimonials = [] }) => {
  const { getTranslatedText: t } = usePageTranslation([
    "Customer Voices",
    "Why shoppers stay with DwellMart",
    "Real feedback from customers who shop with trusted vendors across the marketplace.",
    "Happy Customer"
  ]);
  const displayTestimonials = Array.isArray(testimonials) && testimonials.length > 0
    ? testimonials
    : DEFAULT_TESTIMONIALS;

  return (
    <section className="px-4 py-8 sm:py-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <p className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold tracking-[0.24em] uppercase border border-amber-100">
            {t("Customer Voices")}
          </p>
          <h2 className="mt-4 text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
            {t("Why shoppers stay with DwellMart")}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-gray-600 max-w-2xl mx-auto leading-7">
            {t("Real feedback from customers who shop with trusted vendors across the marketplace.")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {displayTestimonials.map((testimonial, index) => {
            const rating = normalizeRating(testimonial.rating);
            const subtitle = [testimonial.designation, testimonial.company]
              .filter(Boolean)
              .join(" · ");

            return (
              <motion.article
                key={testimonial._id || testimonial.id || `${testimonial.name}-${index}`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="relative overflow-hidden rounded-[28px] border border-amber-100 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-100/60 blur-2xl" />
                <div className="relative flex items-start gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100">
                    {testimonial.image ? (
                      <img
                        src={testimonial.image}
                        alt={testimonial.name || "Customer"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl font-bold text-amber-700">
                        {String(testimonial.name || "D").trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1 text-amber-500">
                      {Array.from({ length: rating }).map((_, starIndex) => (
                        <FiStar key={starIndex} className="fill-current" />
                      ))}
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-gray-900 truncate">
                      {testimonial.name || t("Happy Customer")}
                    </h3>
                    {subtitle ? (
                      <p className="text-sm text-gray-500">{subtitle}</p>
                    ) : null}
                  </div>
                </div>

                <p className="relative mt-5 text-sm sm:text-[15px] leading-7 text-gray-600">
                  "{testimonial.message}"
                </p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
