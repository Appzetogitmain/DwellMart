import React from 'react';
import { Avatar, Rating, Badge, Card } from './ui';

export const ProductReviewCard = ({
  user = 'Anonymous User',
  avatarSrc = null,
  rating = 5,
  date = '',
  comment = '',
  isVerified = true,
  className = '',
}) => {
  return (
    <Card variant="bordered" padding="md" className={`space-y-2.5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar src={avatarSrc} name={user} size="sm" />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-textColor-primary leading-tight">{user}</h4>
              {isVerified && (
                <Badge variant="verified" size="xs">
                  Verified Buyer
                </Badge>
              )}
            </div>
            {date && <p className="text-[10px] text-textColor-muted font-medium mt-0.5">{date}</p>}
          </div>
        </div>

        {/* Rating Stars */}
        <Rating value={rating} readOnly size="sm" showValue />
      </div>

      {/* Comment Body */}
      <p className="text-xs text-textColor-secondary leading-relaxed font-normal">{comment}</p>
    </Card>
  );
};

export default ProductReviewCard;
