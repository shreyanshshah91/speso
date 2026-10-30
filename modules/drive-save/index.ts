import { requireOptionalNativeModule } from 'expo';

interface DriveSaveModule {
  /**
   * Opens Android's "Save to" picker (Google Drive, Files, …) and copies the file there. Resolves
   * with the saved document's URI, or null if the user backed out without saving.
   */
  saveDocument(fileUri: string, mimeType: string, title: string): Promise<string | null>;
}

/** Android only; null elsewhere (and in Expo Go), where callers fall back to the share sheet. */
export default requireOptionalNativeModule<DriveSaveModule>('DriveSave');
