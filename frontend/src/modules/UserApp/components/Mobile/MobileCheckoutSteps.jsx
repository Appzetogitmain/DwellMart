import { FiCheck } from "react-icons/fi";

const MobileCheckoutSteps = ({ currentStep, totalSteps = 3 }) => {
  return (
    <div className="flex items-center justify-center mb-6 px-2 sm:px-4 w-full">
      <div className="flex items-start justify-between w-full max-w-md">
        {Array.from({ length: totalSteps }, (_, index) => {
          const step = index + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-all ${
                    isCompleted
                      ? "bg-brand-primary text-black"
                      : isCurrent
                      ? "bg-brand-primary text-black ring-4 ring-brand-primary/30"
                      : "bg-surface-muted border border-border text-content-muted"
                  }`}>
                  {isCompleted ? <FiCheck className="text-sm sm:text-lg" /> : step}
                </div>
                <span
                  className={`text-[10px] sm:text-xs font-semibold mt-1.5 whitespace-nowrap ${
                    isCurrent
                      ? "text-brand-primary"
                      : isCompleted
                      ? "text-content-secondary"
                      : "text-content-muted"
                  }`}>
                  Step {step}
                </span>
              </div>
              {step < totalSteps && (
                <div className="flex-1 mx-1 sm:mx-2 -mt-4 sm:-mt-5">
                  <div
                    className={`h-0.5 sm:h-1 w-full transition-all ${
                      isCompleted ? "bg-brand-primary" : "bg-border"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MobileCheckoutSteps;
