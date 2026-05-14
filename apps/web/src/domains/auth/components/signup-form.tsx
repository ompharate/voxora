import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  AlertCircle,
  Building,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { Link } from "react-router";
import { Label } from "@/shared/ui/label";
import {
  validateEmail,
  validateName,
  validatePassword,
  validatePasswordConfirmation,
} from "@/shared/lib/validation";
import { useSignup } from "../hooks";
import type { SignupPayload } from "../types/types";

type FieldName = "name" | "email" | "password" | "confirmPassword" | "companyName";
type FieldErrors = Partial<Record<FieldName, string>>;
type TouchedFields = Record<FieldName, boolean>;

const totalSteps = 3;

const stepVariants = {
  initial: { opacity: 0, scale: 0.97, filter: "blur(8px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 1.03, filter: "blur(8px)" },
};

const stepTransition = {
  duration: 0.4,
  ease: [0.23, 1, 0.32, 1] as const,
};

function validateCompanyName(companyName: string) {
  if (!companyName) {
    return "Organization is required";
  }

  if (companyName.length < 2) {
    return "Organization name must be at least 2 characters";
  }

  return null;
}

function getFieldError(field: FieldName, formData: SignupPayload & { confirmPassword: string }) {
  switch (field) {
    case "name":
      return validateName(formData.name);
    case "email":
      return validateEmail(formData.email);
    case "password":
      return validatePassword(formData.password);
    case "confirmPassword":
      return validatePasswordConfirmation(formData.password, formData.confirmPassword);
    case "companyName":
      return validateCompanyName(formData.companyName);
  }
}

function SignupInput({
  id,
  label,
  icon: Icon,
  error,
  touched,
  rightElement,
  className = "",
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  icon: typeof User;
  error?: string;
  touched?: boolean;
  rightElement?: React.ReactNode;
}) {
  const showError = Boolean(touched && error);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          id={id}
          aria-invalid={showError}
          aria-describedby={showError ? `${id}-error` : undefined}
          className={`pl-10 cursor-text ${rightElement ? "pr-10" : ""} ${showError ? "border-destructive" : ""
            } ${className}`}
          {...props}
        />
        {rightElement}
      </div>
      {showError && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SignupForm() {
  const { mutate: signup, isPending, isError, error } = useSignup();
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState<SignupPayload & { confirmPassword: string }>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
    companyName: false,
  });

  const passwordChecks = useMemo(
    () => [
      { label: "8+ characters", isValid: formData.password.length >= 8 },
      { label: "Uppercase letter", isValid: /[A-Z]/.test(formData.password) },
      { label: "Lowercase letter", isValid: /[a-z]/.test(formData.password) },
      { label: "Number", isValid: /[0-9]/.test(formData.password) },
      {
        label: "Special character",
        isValid: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
      },
    ],
    [formData.password]
  );

  const validateFields = (fields: FieldName[]) => {
    const errors = fields.reduce<FieldErrors>((nextErrors, field) => {
      const fieldError = getFieldError(field, formData);

      if (fieldError) {
        nextErrors[field] = fieldError;
      }

      return nextErrors;
    }, {});

    setFieldErrors((prev) => ({
      ...prev,
      ...Object.fromEntries(fields.map((field) => [field, errors[field]])),
    }));

    return Object.keys(errors).length === 0;
  };

  const markTouched = (fields: FieldName[]) => {
    setTouched((prev) => ({
      ...prev,
      ...Object.fromEntries(fields.map((field) => [field, true])),
    }));
  };

  const handleBlur = (field: FieldName) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [field]: getFieldError(field, formData) || undefined,
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target as { name: FieldName; value: string };

    setFormData((prev) => {
      const next = { ...prev, [name]: value };

      if (touched[name]) {
        setFieldErrors((prevErrors) => ({
          ...prevErrors,
          [name]: getFieldError(name, next) || undefined,
          ...(name === "password" && touched.confirmPassword
            ? {
              confirmPassword:
                validatePasswordConfirmation(next.password, next.confirmPassword) || undefined,
            }
            : {}),
        }));
      }

      return next;
    });
  };

  const isStepValid = (step: number) => {
    if (step === 1) {
      return !validateName(formData.name) && !validateEmail(formData.email);
    }

    if (step === 2) {
      return !validateCompanyName(formData.companyName);
    }

    return (
      !validatePassword(formData.password) &&
      !validatePasswordConfirmation(formData.password, formData.confirmPassword)
    );
  };

  const goToNextStep = () => {
    const fieldsByStep: Record<number, FieldName[]> = {
      1: ["name", "email"],
      2: ["companyName"],
      3: ["password", "confirmPassword"],
    };
    const fields = fieldsByStep[currentStep];

    markTouched(fields);

    if (validateFields(fields)) {
      setCurrentStep((step) => Math.min(step + 1, totalSteps));
    }
  };

  const goToPreviousStep = () => {
    setCurrentStep((step) => Math.max(step - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentStep < totalSteps) {
      const fieldsByStep: Record<number, FieldName[]> = {
        1: ["name", "email"],
        2: ["companyName"],
      };
      const fields = fieldsByStep[currentStep];

      markTouched(fields);
      if (validateFields(fields)) {
        setCurrentStep(currentStep + 1);
      }
      return;
    }

    const allFields: FieldName[] = ["name", "email", "companyName", "password", "confirmPassword"];
    markTouched(allFields);

    if (!validateFields(allFields)) {
      if (validateName(formData.name) || validateEmail(formData.email)) {
        setCurrentStep(1);
      } else if (validateCompanyName(formData.companyName)) {
        setCurrentStep(2);
      } else {
        setCurrentStep(3);
      }

      return;
    }

    signup({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      companyName: formData.companyName,
    });
  };

  const renderVisibilityToggle = (
    isVisible: boolean,
    onToggle: () => void,
    label: string
  ) => (
    <button
      type="button"
      aria-label={label}
      onClick={onToggle}
      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
    >
      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="w-full max-w-md mx-auto md:mx-0">
      <div className="space-y-2 mb-10">
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Create Account</h2>
        <p className="text-muted-foreground font-medium">Start your journey with InteraOne today.</p>
      </div>

      <div className="flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          {/* Progress Section */}
          <div className="space-y-4" aria-live="polite">
            <div className="flex items-center justify-between text-[10px] tracking-widest uppercase font-bold text-muted-foreground/60">
              <span className="flex items-center gap-2">
                <span className="text-primary">Step {currentStep}</span>
                <span className="opacity-30">/</span>
                <span>{totalSteps}</span>
              </span>
              <span className="text-foreground/70">
                {currentStep === 1
                  ? "Your Details"
                  : currentStep === 2
                    ? "Organization"
                    : "Secure Account"}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20 border border-border/5">
              <motion.div
                className="h-full rounded-full bg-primary shadow-[0_0_12px_rgba(var(--primary),0.3)]"
                initial={false}
                animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>

          {/* Form Content Area */}
          <div className="relative flex-1 min-h-[360px] flex flex-col no-scrollbar overflow-y-auto">
            {isError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg flex items-center gap-3 text-destructive text-sm mb-6 shrink-0"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="font-medium">{error?.message || "Signup failed"}</p>
              </motion.div>
            )}
            <AnimatePresence mode="wait" initial={false}>
              {currentStep === 1 && (
                <motion.div
                  key="signup-step-1"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={stepTransition}
                  className="space-y-5 w-full"
                >
                  <SignupInput
                    id="name"
                    name="name"
                    type="text"
                    label="Full Name"
                    icon={User}
                    placeholder="Enter full name"
                    value={formData.name}
                    onChange={handleInputChange}
                    onBlur={() => handleBlur("name")}
                    error={fieldErrors.name}
                    touched={touched.name}
                    disabled={isPending}
                    className="h-11 bg-muted/10 border-border/40 focus:bg-muted/20"
                  />

                  <SignupInput
                    id="email"
                    name="email"
                    type="email"
                    label="Email Address"
                    icon={Mail}
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    onBlur={() => handleBlur("email")}
                    error={fieldErrors.email}
                    touched={touched.email}
                    disabled={isPending}
                    className="h-11 bg-muted/10 border-border/40 focus:bg-muted/20"
                  />
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  key="signup-step-2"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={stepTransition}
                  className="space-y-5 w-full"
                >
                  <SignupInput
                    id="companyName"
                    name="companyName"
                    type="text"
                    label="Organization Name"
                    icon={Building}
                    placeholder="Acme Inc."
                    value={formData.companyName}
                    onChange={handleInputChange}
                    onBlur={() => handleBlur("companyName")}
                    error={fieldErrors.companyName}
                    touched={touched.companyName}
                    disabled={isPending}
                    className="h-11 bg-muted/10 border-border/40 focus:bg-muted/20"
                  />
                </motion.div>
              )}

              {currentStep === 3 && (
                <motion.div
                  key="signup-step-3"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={stepTransition}
                  className="space-y-5 w-full"
                >
                  <SignupInput
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    label="Password"
                    icon={Lock}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleInputChange}
                    onBlur={() => handleBlur("password")}
                    error={fieldErrors.password}
                    touched={touched.password}
                    disabled={isPending}
                    className="h-11 bg-muted/10 border-border/40 focus:bg-muted/20"
                    rightElement={renderVisibilityToggle(
                      showPassword,
                      () => setShowPassword((v) => !v),
                      showPassword ? "Hide password" : "Show password"
                    )}
                  />

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
                    {passwordChecks.map((check) => (
                      <div
                        key={check.label}
                        className={`flex items-center gap-2 transition-colors ${check.isValid ? "text-primary" : "text-muted-foreground/50"
                          }`}
                      >
                        <CheckCircle2 className={`h-3 w-3 ${check.isValid ? "opacity-100" : "opacity-40"}`} />
                        <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">{check.label}</span>
                      </div>
                    ))}
                  </div>

                  <SignupInput
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    label="Confirm Password"
                    icon={Lock}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    onBlur={() => handleBlur("confirmPassword")}
                    error={fieldErrors.confirmPassword}
                    touched={touched.confirmPassword}
                    disabled={isPending}
                    className="h-11 bg-muted/10 border-border/40 focus:bg-muted/20"
                    rightElement={renderVisibilityToggle(
                      showConfirmPassword,
                      () => setShowConfirmPassword((v) => !v),
                      showConfirmPassword ? "Hide password" : "Show password"
                    )}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-4 pt-4 border-t border-border/5 mt-auto">
            <div className="flex gap-3">
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPreviousStep}
                  disabled={isPending}
                  className="flex-1 h-12 font-semibold border-border/40 hover:bg-muted/30 transition-all active:scale-95"
                >
                  Back
                </Button>
              )}

              {currentStep < totalSteps ? (
                <Button
                  type="button"
                  onClick={goToNextStep}
                  disabled={!isStepValid(currentStep) || isPending}
                  className="flex-1 h-12 font-semibold shadow-lg shadow-primary/20 transition-all active:scale-95"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!isStepValid(currentStep) || isPending}
                  className="flex-1 h-12 font-semibold shadow-lg shadow-primary/20 transition-all active:scale-95"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              )}
            </div>

            <p className="text-center text-sm text-muted-foreground font-medium">
              Already have an account?{" "}
              <Link
                to="/auth/login"
                className="text-primary hover:text-primary/80 transition-colors font-bold"
              >
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
