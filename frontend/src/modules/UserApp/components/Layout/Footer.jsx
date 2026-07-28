import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiFacebook,
  FiTwitter,
  FiInstagram,
  FiYoutube,
  FiChevronRight
} from "react-icons/fi";
import { motion } from "framer-motion";
import { loginLogo } from "../../../../shared/utils/imagePaths";
import api from "../../../../shared/utils/api";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../../hooks/useDynamicTranslation";

import { useSettingsStore } from "../../../../shared/store/settingsStore";

const Footer = () => null;

export default Footer;
