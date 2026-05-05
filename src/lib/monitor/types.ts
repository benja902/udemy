export type CourseStatus =
  | "free"
  | "paid"
  | "discount"
  | "expired_coupon"
  | "error";

export type CouponSource = {
  id: string;
  name: string;
  source_url: string;
  coupon_selector: string | null;
  coupon_regex: string | null;
  active: boolean;
  last_seen_coupon: string | null;
};

export type Course = {
  id: string;
  title: string;
  udemy_url: string;
  instructor_name: string | null;
  active: boolean;
};

export type Coupon = {
  id: string;
  source_id: string;
  code: string;
};

export type CouponDetection = {
  code: string | null;
  rawContext: string | null;
};

export type VerificationResult = {
  status: CourseStatus;
  finalPrice: number | null;
  currency: string | null;
  detectedLabel: string | null;
  checkedUrl: string;
  errorMessage?: string;
};
