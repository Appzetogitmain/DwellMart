import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { getPlaceholderImage } from "../utils/helpers";
import { Card } from "./ui";

const CategoryCard = ({ category }) => {
  const categoryLink = `/category/${category.id}`;

  return (
    <Link to={categoryLink} className="block h-full">
      <Card
        variant="default"
        hoverable
        padding="none"
        className="h-full flex flex-col group overflow-hidden bg-surface-card border-borderToken-default"
      >
        <div className="w-full h-24 md:h-32 bg-surface-background flex items-center justify-center overflow-hidden relative">
          <img
            src={category.image}
            alt={category.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = getPlaceholderImage(200, 200, category.name || "Category");
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
        <div className="p-3 flex-1 flex items-center justify-center">
          <h3 className="text-sm font-bold text-textColor-primary text-center group-hover:text-brand-primary transition-colors">
            {category.name}
          </h3>
        </div>
      </Card>
    </Link>
  );
};

export default CategoryCard;
