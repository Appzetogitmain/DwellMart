import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/config/db.js';
import Settings from '../src/models/Settings.model.js';

export const TERMS_AND_CONDITIONS_CONTENT = `DWELL MART TERMS & CONDITIONS

Effective Date: 01 January 2026
Last Updated: 27 July 2026

1. Introduction

Welcome to Dwell Mart (“Dwell Mart”, “we”, “our”, or “us”).

These Terms & Conditions govern your use of the Dwell Mart website, mobile application, and related services (“Platform”). By accessing or using the Platform, you agree to be bound by these Terms.

If you do not agree with these Terms, please do not use the Platform.

2. Definitions

* Platform means the Dwell Mart website, mobile application, and associated services.
* Buyer means any person purchasing products or services through the Platform.
* Seller means any registered business or individual offering products or services through the Platform.
* User means any person using the Platform.
* Order means a request placed by a Buyer for products or services.
* Dwell Mart Express means the instant delivery service operated by or through Dwell Mart.

3. Eligibility

Users must:
* Be at least 18 years of age or have the consent of a parent or legal guardian.
* Provide accurate registration information.
* Maintain the confidentiality of their account credentials.
* Be responsible for all activities conducted through their account.

4. Marketplace Model

Dwell Mart operates as an online marketplace connecting Buyers with independent Sellers.

Unless specifically stated otherwise:
* Dwell Mart does not manufacture listed products.
* Product quality remains the responsibility of the Seller.
* Product descriptions are provided by Sellers.
* Sellers are responsible for inventory accuracy.
* Sellers are responsible for applicable taxes unless otherwise specified.

5. User Accounts

Users agree to:
* Keep login credentials confidential.
* Provide accurate and updated information.
* Notify Dwell Mart immediately of unauthorized account access.
* Not create fraudulent or duplicate accounts.

Dwell Mart reserves the right to suspend or terminate accounts that violate these Terms.

6. Orders

An order placed through the Platform constitutes an offer to purchase.

Orders are subject to:
* Product availability
* Seller acceptance
* Successful payment authorization
* Compliance with applicable laws

Dwell Mart reserves the right to cancel orders due to pricing errors, suspected fraud, stock unavailability, or legal requirements.

7. Payments

Payments may be made through approved payment methods available on the Platform.

Where applicable:
* Prices include applicable taxes unless stated otherwise.
* Refunds will be processed according to the Return & Refund Policy.
* Dwell Mart may use third-party payment service providers.

8. Shipping

Shipping timelines are estimates only.

Delivery times may vary due to:
* Weather conditions
* Natural disasters
* Public holidays
* Traffic
* Courier delays
* Other circumstances beyond reasonable control

9. Dwell Mart Express

For Express orders:
* Delivery times are estimates and not guaranteed.
* Availability depends on service area, order volume, weather, and operational conditions.
* Orders may be cancelled if delivery cannot be completed safely or reasonably.

10. Returns & Refunds

Returns, exchanges, and refunds are governed by the Dwell Mart Return, Refund & Cancellation Policy.

Some products may be non-returnable due to hygiene, perishability, customization, or legal restrictions.

11. Prohibited Activities

Users must not:
* Engage in fraudulent transactions.
* Upload false or misleading content.
* Infringe intellectual property rights.
* Distribute malware or harmful code.
* Attempt unauthorized access to the Platform.
* Use the Platform for unlawful purposes.

12. Intellectual Property

The Dwell Mart name, logo, trademarks, software, website design, graphics, and content are owned by Dwell Mart or its licensors.

No content may be copied, reproduced, distributed, or modified without prior written permission.

13. Limitation of Liability

To the maximum extent permitted by law, Dwell Mart shall not be liable for indirect, incidental, consequential, special, or punitive damages arising from the use of the Platform.

14. Indemnification

Users agree to indemnify and hold harmless Dwell Mart, its directors, employees, affiliates, and partners from claims, losses, liabilities, damages, and expenses arising from misuse of the Platform or violation of these Terms.

15. Governing Law

These Terms shall be governed by the laws of India.

Subject to applicable law, disputes shall be subject to the exclusive jurisdiction of the competent courts in New Delhi, India, unless otherwise required by law.

16. Contact

Dwell Mart
Email: support@dwellmart.shop
Website: https://www.dwellmart.shop`;

export const RETURN_AND_REFUND_CONTENT = `DWELL MART RETURN & REFUND POLICY

Effective Date: 01 January 2026
Last Updated: 27 July 2026

1. Overview

At Dwell Mart, we strive to provide an exceptional shopping experience. This Return, Refund & Cancellation Policy outlines the conditions, eligibility windows, and procedures for returning items, requesting refunds, or cancelling orders placed on the Dwell Mart Platform.

2. Return Window & Eligibility

* Standard Marketplace Products: Eligible items may be returned within 7 days of delivery if delivered damaged, defective, wrong product, or significantly different from the product description.
* Dwell Mart Express Items (Groceries, Perishables, Fresh Food): Perishable items must be inspected upon delivery. Damaged, expired, or missing items must be reported within 24 hours of delivery.
* Product Condition: Returned products must be unused, unwashed, in original condition with all original tags, manuals, accessories, and packaging intact.

3. Non-Returnable Categories

The following items are non-returnable due to health, hygiene, and legal regulations:
* Perishable goods (fresh milk, dairy, vegetables, fruits, bakery, flowers after 24 hours)
* Opened personal care, skincare, haircare, cosmetics, and hygiene products
* Innerwear, undergarments, and swimwear
* Customized, personalized, or made-to-order items
* Digital items, gift cards, or downloadable products

4. Return & Replacement Process

1. Log in to your Dwell Mart account and navigate to "My Orders".
2. Select the order and item you wish to return, select the reason, and upload photos/videos of defective or incorrect items.
3. Upon approval by Dwell Mart or the Seller, a reverse pickup will be scheduled at your delivery address.

5. Refund Terms

* Refunds are initiated after the returned item passes quality verification at our warehouse or Seller facility.
* Prepaid Orders (UPI, Cards, Net Banking, Wallets): Refund will be processed back to the original source account within 5–7 business days of approval.
* Cash on Delivery (COD) Orders: Refund will be issued as Dwell Mart Wallet credit or credited via NEFT to your verified bank account within 5–7 business days upon receiving bank details.

6. Order Cancellations

* Buyer Cancellation: You may cancel your order free of charge anytime before the status changes to "Dispatched".
* Seller/Platform Cancellation: Dwell Mart or Sellers reserve the right to cancel orders due to stock unavailability, pricing errors, or unserviceable delivery locations. Prepaid cancelled orders will be fully refunded immediately.

7. Customer Support

For return or refund inquiries, please contact our Customer Support:
Email: support@dwellmart.shop
Website: https://www.dwellmart.shop`;

export const SHIPPING_POLICY_CONTENT = `DWELL MART SHIPPING & DELIVERY POLICY

Effective Date: 01 January 2026
Last Updated: 27 July 2026

1. Overview

Dwell Mart provides reliable shipping and delivery services across India through independent Sellers, logistics partners, and Dwell Mart Express instant delivery network.

2. Delivery Modes & Estimated Timelines

* Standard Marketplace Delivery: Sellers dispatch orders within 24 to 48 hours of order confirmation. Typical delivery time ranges from 2 to 7 business days depending on location and courier service.
* Dwell Mart Express Delivery: Delivers daily essentials, groceries, bakery, dairy, medicines, and flowers within 10 to 30 minutes in eligible operational zones.

3. Shipping Charges

* Standard Delivery Charges: Calculated at checkout based on order total, product weight, dimensions, and pincode destination. Free shipping may apply on orders exceeding minimum threshold amounts.

4. Order Tracking

* Once your order is dispatched, a tracking ID and live tracking link will be sent via SMS/Email and updated under "My Orders" on the Dwell Mart App/Website.

5. Delivery Attempts & Address Accuracy

* Buyers must ensure accurate delivery addresses, pincodes, and active phone numbers.
* Logistics partners will attempt delivery up to 3 times. Unclaimed orders after 3 attempts will be returned to the Seller and processed under our Cancellation & Return policy.

6. Delivery Delays & Force Majeure

While we aim for timely deliveries, shipping times are estimates. Dwell Mart and Sellers shall not be liable for delivery delays caused by extreme weather conditions, natural disasters, public holidays, regional curfews, traffic congestion, courier delays, or events beyond reasonable control.

7. Contact Support

For shipping assistance or delivery updates, contact us at:
Email: support@dwellmart.shop
Website: https://www.dwellmart.shop`;

export const VENDOR_AGREEMENT_CONTENT = `VENDOR AGREEMENT

BETWEEN

DWELL MART PRIVATE LIMITED, a company incorporated under the Companies Act, 2013, having its registered office at New Delhi, India (hereinafter referred to as the “Company” or “Dwell Mart”, which expression shall, unless repugnant to the context, include its successors and permitted assigns);

AND

The registered vendor/seller applying on or operating through Dwell Mart (hereinafter referred to as the “Vendor”, which expression shall include its successors, legal representatives and permitted assigns).

The Company and the Vendor are individually referred to as a “Party” and collectively as the “Parties.”

⸻

1. PURPOSE

The Vendor appoints Dwell Mart as a non-exclusive online marketplace platform to display, promote and facilitate the sale of the Vendor’s products and/or services through the Dwell Mart website, mobile application and associated digital platforms.

⸻

2. TERM

This Agreement shall commence on the Effective Date and shall continue unless terminated in accordance with this Agreement.

⸻

3. VENDOR ELIGIBILITY

The Vendor represents and warrants that it:
* is legally registered to conduct business in India;
* possesses all required licenses and approvals;
* holds valid GST registration where applicable;
* owns or is authorized to sell the listed products;
* complies with all applicable laws and regulations.

⸻

4. PRODUCT LISTINGS

The Vendor shall:
* provide accurate descriptions;
* upload genuine product images;
* specify correct specifications;
* maintain updated inventory;
* maintain accurate pricing;
* disclose warranty information where applicable.

The Vendor shall not upload false, misleading or infringing content.

⸻

5. PROHIBITED PRODUCTS

The Vendor shall not list:
* counterfeit goods;
* stolen property;
* prohibited drugs;
* illegal weapons;
* tobacco products where prohibited;
* alcohol where prohibited;
* hazardous materials without authorization;
* products infringing intellectual property rights;
* any product prohibited under Indian law or Dwell Mart policies.

Dwell Mart may immediately remove any prohibited listing.

⸻

6. QUALITY STANDARDS

The Vendor agrees that all products shall:
* be genuine;
* be new unless clearly disclosed otherwise;
* comply with BIS/FSSAI/legal requirements where applicable;
* be free from manufacturing defects;
* match the product listing.

⸻

7. INVENTORY MANAGEMENT

The Vendor shall maintain sufficient stock.
Overselling or repeated stock-outs may result in penalties, suspension or termination.

⸻

8. ORDER ACCEPTANCE

Orders received through Dwell Mart shall be accepted or rejected within the timeline prescribed by Dwell Mart.
Failure to respond may result in automatic cancellation.

⸻

9. PACKAGING

The Vendor shall package products securely using industry-standard materials.
Fragile products shall receive appropriate protective packaging.
Perishable products shall be packed according to applicable food safety standards.

⸻

10. SHIPPING

Where shipping is handled by the Vendor, the Vendor shall:
* dispatch orders within the prescribed timeline;
* upload tracking information;
* ensure timely delivery;
* cooperate with logistics partners.

Where Dwell Mart or Dwell Mart Express manages logistics, the Vendor shall ensure products are ready for pickup within the agreed preparation time.

⸻

11. DWELL MART EXPRESS

Vendors participating in Dwell Mart Express agree to:
* maintain live inventory;
* prepare orders promptly;
* meet operational timelines communicated by Dwell Mart;
* comply with service quality standards.

Repeated failures may lead to removal from the Dwell Mart Express program.

⸻

12. COMMISSION

The Vendor agrees to pay the commission, platform fees, logistics charges, payment gateway charges and any other applicable fees communicated by Dwell Mart.
The applicable fee schedule may be updated by Dwell Mart with prior notice.

⸻

13. PAYMENTS

Payments shall be released after:
* successful delivery;
* applicable return period;
* deduction of commissions, refunds, taxes, shipping and other agreed charges.

The payout schedule shall be communicated separately by Dwell Mart.

⸻

14. TAXES

The Vendor shall:
* issue valid tax invoices where required;
* remain responsible for GST compliance;
* file applicable returns;
* indemnify Dwell Mart against tax liabilities arising from the Vendor’s non-compliance.

⸻

15. RETURNS AND REFUNDS

The Vendor agrees to comply with the Dwell Mart Return and Refund Policy.
Where a return is approved due to the Vendor’s error, the Vendor shall bear the applicable costs unless otherwise agreed.

⸻

16. WARRANTIES

The Vendor warrants that:
* products are genuine;
* products are lawful;
* listings are accurate;
* no third-party rights are infringed.

⸻

17. INTELLECTUAL PROPERTY

The Vendor grants Dwell Mart a non-exclusive, royalty-free licence during the term of this Agreement to use the Vendor’s trade names, trademarks, logos and product images solely for marketing and operating the marketplace.
Ownership of such intellectual property remains with the Vendor.

⸻

18. CONFIDENTIALITY

Both Parties shall maintain the confidentiality of business, commercial and customer information obtained under this Agreement and shall not disclose it except as required by law or for the performance of this Agreement.

⸻

19. DATA PROTECTION

The Vendor shall comply with applicable Indian data protection laws and Dwell Mart’s privacy and information security requirements.

⸻

20. AUDIT

Dwell Mart may request reasonable documentation to verify compliance with this Agreement, including product authenticity, certifications and tax registrations.

⸻

21. SUSPENSION

Dwell Mart may suspend the Vendor account for:
* fraud;
* counterfeit products;
* repeated customer complaints;
* policy violations;
* legal non-compliance;
* failure to maintain service standards.

⸻

22. TERMINATION

Either Party may terminate this Agreement by providing thirty (30) days’ written notice, unless immediate termination is permitted due to material breach, fraud, illegal activity or other serious violations.
Termination shall not affect obligations accrued prior to the termination date.

⸻

23. LIMITATION OF LIABILITY

To the maximum extent permitted by law, neither Party shall be liable for indirect, incidental, special or consequential damages arising out of this Agreement, except where liability cannot lawfully be excluded.

⸻

24. INDEMNITY

The Vendor shall indemnify and hold harmless Dwell Mart, its directors, officers, employees and affiliates from any claims, losses, liabilities, damages, costs or expenses arising from:
* defective products;
* inaccurate listings;
* intellectual property infringement;
* breach of law;
* breach of this Agreement.

⸻

25. FORCE MAJEURE

Neither Party shall be liable for delays or failures caused by events beyond reasonable control, including natural disasters, pandemics, governmental actions, war, labour disputes or failures of public utilities.

⸻

26. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of India.

⸻

27. DISPUTE RESOLUTION

The Parties shall first attempt to resolve disputes through good-faith negotiations.
If unresolved within thirty (30) days, disputes shall be referred to arbitration in accordance with the Arbitration and Conciliation Act, 1996. The seat and venue of arbitration shall be New Delhi, India, unless otherwise agreed.
Subject to the arbitration clause, the courts having jurisdiction over New Delhi shall have supervisory jurisdiction.

⸻

28. ENTIRE AGREEMENT

This Agreement, together with the Dwell Mart Seller Policies and any schedules incorporated by reference, constitutes the entire agreement between the Parties regarding its subject matter.

⸻

29. SIGNATURES

For DWELL MART PRIVATE LIMITED
Authorized Representative / Management
Dwell Mart Private Limited
New Delhi, India

For Vendor
Registered Vendor / Authorized Signatory
Operating on Dwell Mart Marketplace`;

export const seedPoliciesInDb = async () => {
  const policiesToSeed = [
    {
      key: 'page_terms',
      value: { title: 'Terms & Conditions', content: TERMS_AND_CONDITIONS_CONTENT }
    },
    {
      key: 'page_returns',
      value: { title: 'Return & Refund Policy', content: RETURN_AND_REFUND_CONTENT }
    },
    {
      key: 'page_shipping',
      value: { title: 'Shipping & Delivery Policy', content: SHIPPING_POLICY_CONTENT }
    },
    {
      key: 'page_partner',
      value: { title: 'Become a Partner - Vendor Agreement', content: VENDOR_AGREEMENT_CONTENT }
    },
    {
      key: 'vendor_terms_and_conditions',
      value: { content: VENDOR_AGREEMENT_CONTENT }
    }
  ];

  for (const item of policiesToSeed) {
    await Settings.findOneAndUpdate(
      { key: item.key },
      { key: item.key, value: item.value },
      { upsert: true, new: true }
    );
  }

  return policiesToSeed.length;
};

const runScript = async () => {
  try {
    console.log('📜 Seeding DwellMart Legal Policies & Vendor Agreement...');
    await connectDB();
    const count = await seedPoliciesInDb();
    console.log(`✅ Successfully seeded ${count} policies (Terms, Returns, Shipping, Vendor Terms) into database!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding policies:', error);
    process.exit(1);
  }
};

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seedPolicies.js')) {
  runScript();
}
