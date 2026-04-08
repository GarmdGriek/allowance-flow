// Backwards compatibility import shim
import { apiClient } from "../app";
console.warn(`'import brain from "brain"' is deprecated, please 'import { apiClient } from "app"' instead`);
export default apiClient;
