import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Mail,
  Lock,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { Alert } from "@/shared/ui/alert";
import { validateEmail, validatePassword } from "@/shared/lib/validation";
import { authApi } from "../api/auth.api";
import Logo from "@/shared/components/logo";
import { OTPInput } from "./otp-input.tsx";
import { ResendOTPTimer } from "./resend-otp-timer.tsx";

type RecoveryStep = "email" | "otp" | "reset";

export function PasswordRecoveryForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Email step handler
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await authApi.forgotPassword(email);
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // OTP step handler
  const handleOtpComplete = async (code: string) => {
    setOtp(code);
    setIsLoading(true);
    setError(null);
    try {
      await authApi.verifyOTP(email, code, "password_reset");
      setStep("reset");
    } catch (err: any) {
      setError(err.message || "Invalid or expired code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset password handler
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await authApi.resetPasswordWithOTP({ email, code: otp, newPassword: password });
      setIsSuccess(true);
      setTimeout(() => navigate("/auth/login"), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    await authApi.resendOTP(email, "password_reset");
  };

  if (isSuccess) {
    return (
      <Card className="w-full max-w-md border-border/40 shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Password Reset Successful</CardTitle>
          <CardDescription>
            Your security is our priority. You can now log in with your new password.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground mb-6">Redirecting to login page...</p>
          <Link to="/auth/login" className="w-full">
            <Button className="w-full font-bold">Go to Login</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-border/40 shadow-2xl overflow-hidden">
      <div className="h-1.5 w-full bg-muted/20">
        <div 
          className="h-full bg-primary transition-all duration-500 ease-out" 
          style={{ width: step === "email" ? "33%" : step === "otp" ? "66%" : "100%" }}
        />
      </div>
      <CardHeader className="space-y-1 pt-8">
        <div className="flex items-center justify-center mb-6">
          <Logo size={48} animate={false} />
        </div>
        <CardTitle className="text-2xl font-bold text-center">
          {step === "email" && "Recovery Email"}
          {step === "otp" && "Verification"}
          {step === "reset" && "Secure Password"}
        </CardTitle>
        <CardDescription className="text-center">
          {step === "email" && "Enter your email to receive a secure recovery code."}
          {step === "otp" && `Enter the 6-digit code sent to ${email}`}
          {step === "reset" && "Create a strong, unique password for your account."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-8">
        {error && (
          <Alert variant="destructive" className="mb-6 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </Alert>
        )}

        {step === "email" && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 bg-muted/10 border-border/40"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-bold shadow-lg shadow-primary/20" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Verification Code"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <div className="space-y-8">
            <OTPInput 
              value={otp} 
              onChange={(val) => {
                setOtp(val);
                if (val.length === 6) {
                  handleOtpComplete(val);
                }
              }} 
              disabled={isLoading} 
            />
            <ResendOTPTimer onResend={handleResend} />
            <Button 
              variant="ghost" 
              className="w-full text-muted-foreground" 
              onClick={() => setStep("email")}
              disabled={isLoading}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Change Email
            </Button>
          </div>
        )}

        {step === "reset" && (
          <form onSubmit={handleResetSubmit} className="space-y-5">
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="New Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-muted/10 border-border/40"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-muted/10 border-border/40"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-bold shadow-lg shadow-primary/20" disabled={isLoading}>
              {isLoading ? "Updating..." : "Reset Password"}
            </Button>
          </form>
        )}

        <div className="mt-8 text-center">
          <Link to="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors inline-flex items-center">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
