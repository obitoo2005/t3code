const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

/**
 * Overrides react-native-screens' Android fragment transitions with GPU-pure translate curves
 * (zero <alpha> hardware-layer promotion, so zero FBO black-frame flashes!) and a gentle 45ms
 * launch ramp (`controlX1=0.32, controlY1=0.06, controlX2=0.16, controlY2=1.0`) so Fabric commits
 * the incoming screen's header & UI before it sweeps across the viewport.
 */

const IOS_NAV_CURVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<pathInterpolator xmlns:android="http://schemas.android.com/apk/res/android"
    android:controlX1="0.32"
    android:controlY1="0.06"
    android:controlX2="0.16"
    android:controlY2="1.0" />
`;

const IOS_MODAL_CURVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<pathInterpolator xmlns:android="http://schemas.android.com/apk/res/android"
    android:controlX1="0.28"
    android:controlY1="0.08"
    android:controlX2="0.18"
    android:controlY2="1.0" />
`;

const ANIM_OVERRIDES = {
  "rns_ios_from_right_foreground_open.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="285"
    android:interpolator="@interpolator/ios_nav_curve"
    android:fromXDelta="100%"
    android:toXDelta="0%"
    android:zAdjustment="top" />
`,
  "rns_ios_from_right_background_open.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="285"
    android:interpolator="@interpolator/ios_nav_curve"
    android:fromXDelta="0%"
    android:toXDelta="-26%" />
`,
  "rns_ios_from_right_foreground_close.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="255"
    android:interpolator="@interpolator/ios_nav_curve"
    android:fromXDelta="0%"
    android:toXDelta="100%"
    android:zAdjustment="top" />
`,
  "rns_ios_from_right_background_close.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="255"
    android:interpolator="@interpolator/ios_nav_curve"
    android:fromXDelta="-26%"
    android:toXDelta="0%" />
`,
  "rns_slide_in_from_bottom.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="290"
    android:interpolator="@interpolator/ios_modal_curve"
    android:fromYDelta="100%"
    android:toYDelta="0%"
    android:zAdjustment="top" />
`,
  "rns_slide_out_to_bottom.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="240"
    android:interpolator="@interpolator/ios_modal_curve"
    android:fromYDelta="0%"
    android:toYDelta="100%"
    android:zAdjustment="top" />
`,
};

module.exports = function withAndroidIosMotion(config) {
  return withDangerousMod(config, [
    "android",
    async (nextConfig) => {
      const resRoot = path.join(
        nextConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      const interpolatorDir = path.join(resRoot, "interpolator");
      const animDir = path.join(resRoot, "anim");
      fs.mkdirSync(interpolatorDir, { recursive: true });
      fs.mkdirSync(animDir, { recursive: true });

      fs.writeFileSync(path.join(interpolatorDir, "ios_nav_curve.xml"), IOS_NAV_CURVE_XML);
      fs.writeFileSync(path.join(interpolatorDir, "ios_modal_curve.xml"), IOS_MODAL_CURVE_XML);

      for (const [filename, xml] of Object.entries(ANIM_OVERRIDES)) {
        fs.writeFileSync(path.join(animDir, filename), xml);
      }

      return nextConfig;
    },
  ]);
};
