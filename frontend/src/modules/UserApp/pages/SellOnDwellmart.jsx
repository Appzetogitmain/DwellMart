import DesktopHeader from '../components/Layout/DesktopHeader';
import MobileHeader from '../components/Layout/MobileHeader';
import SubscriptionOnboardingWizard from '../../Vendor/components/SubscriptionOnboardingWizard';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

const SellOnDwellmart = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Sell on DwellMart with recurring billing built in',
    'Start your vendor onboarding here and the platform will route billing through Razorpay for India or Stripe everywhere else.',
    'Start your vendor onboarding',
    'The same secure onboarding flow powers the public seller page and the dedicated vendor registration page.'
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#221300] via-[#3a2403] to-[#1a1204]">
      <DesktopHeader />
      <MobileHeader />

      <section className="px-4 pt-12 pb-6 text-white text-center">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl text-white">
            {t('Sell on DwellMart with recurring billing built in')}
          </h1>
          <p className="mt-3 mx-auto max-w-2xl text-sm md:text-base text-white/70">
            {t('Start your vendor onboarding here and the platform will route billing through Razorpay for India or Stripe everywhere else.')}
          </p>
        </div>
      </section>

      <section className="px-4 py-8">
        <SubscriptionOnboardingWizard
          emailStorageKey="vendor-onboarding-email:/sell-on-dwellmart"
          returnTo="/sell-on-dwellmart"
          title={t('Start your vendor onboarding')}
          subtitle={t('The same secure onboarding flow powers the public seller page and the dedicated vendor registration page.')}
        />
      </section>
    </div>
  );
};

export default SellOnDwellmart;
