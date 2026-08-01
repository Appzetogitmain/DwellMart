import React from 'react';
import { FiZap, FiPackage, FiShoppingBag } from 'react-icons/fi';
import {
    normalizeExperience,
    EXPERIENCES,
    getExperienceShortLabel,
    getExperienceBadgeStyle,
} from '../utils/experienceUtils';

/**
 * Universal Experience Badge Component
 * Used across Customer, Vendor, Admin, and Delivery views.
 */
const ExperienceBadge = ({
    experience,
    variant = 'subtle',
    size = 'sm',
    showIcon = true,
    className = '',
}) => {
    const norm = normalizeExperience(experience);
    const label = getExperienceShortLabel(norm);
    const style = getExperienceBadgeStyle(norm);

    const getIcon = () => {
        switch (norm) {
            case EXPERIENCES.QUICK_COMMERCE:
                return <FiZap className="inline-block flex-shrink-0" />;
            case EXPERIENCES.WHOLESALE:
                return <FiPackage className="inline-block flex-shrink-0" />;
            case EXPERIENCES.MARKETPLACE:
            default:
                return <FiShoppingBag className="inline-block flex-shrink-0" />;
        }
    };

    const sizeClasses = {
        sm: 'text-[11px] px-2 py-0.5 gap-1 font-semibold rounded-md',
        md: 'text-xs px-2.5 py-1 gap-1.5 font-bold rounded-lg',
        lg: 'text-sm px-3 py-1.5 gap-2 font-extrabold rounded-xl',
    }[size] || 'text-[11px] px-2 py-0.5 gap-1 font-semibold rounded-md';

    let variantClasses = '';
    if (variant === 'solid') {
        variantClasses = `${style.pill} shadow-sm`;
    } else if (variant === 'minimal') {
        variantClasses = `${style.text} bg-transparent font-bold`;
    } else {
        // subtle (default)
        variantClasses = `${style.bg} ${style.text} border ${style.border}`;
    }

    return (
        <span className={`inline-flex items-center tracking-tight ${sizeClasses} ${variantClasses} ${className}`}>
            {showIcon && getIcon()}
            <span>{label}</span>
        </span>
    );
};

export default React.memo(ExperienceBadge);
