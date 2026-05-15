import { Router } from "express";
import * as AuthController from "./auth.controller";
import { authenticate, validateRequest, authRateLimit, otpRateLimit } from "@shared/middleware";
import { authSchema } from "./auth.schema";

const router = Router();

// ─── Bootstrap (public) ───────────────────────────────────────────────────────
router.get("/bootstrap-status", AuthController.bootstrapCheck);

router.post(
  "/setup",
  authRateLimit,
  validateRequest(authSchema.adminSignup),
  AuthController.adminSignup,
);

// ─── Multi-step Signup ────────────────────────────────────────────────────────
router.post("/initiate-signup", AuthController.initiateSignup);
router.post("/complete-signup", AuthController.completeSignup);

// ─── Unified Login ────────────────────────────────────────────────────────────
router.post(
  "/login",
  authRateLimit,
  validateRequest(authSchema.login),
  AuthController.login,
);

// ─── OTP / Verification ───────────────────────────────────────────────────────
router.post("/verify-email", otpRateLimit, AuthController.verifyEmail);
router.post("/resend-otp", otpRateLimit, AuthController.resendOTP);
router.post("/verify-otp", otpRateLimit, AuthController.verifyOTP);
router.post("/reset-password-otp", otpRateLimit, AuthController.resetPasswordWithOTP);


// ─── Password Reset ───────────────────────────────────────────────────────────
router.post("/forgot-password", AuthController.forgotPassword);

router.post("/refresh-token", AuthController.refreshToken);

// ─── Protected ────────────────────────────────────────────────────────────────
router.use(authenticate);

router.post("/logout", AuthController.logout);
router.get("/profile", AuthController.getProfile);

export { router as authRouter };
export default router;
