//! The app was called Mailbird until ADR-0071. Its desktop and phone data
//! lived under the old app id (`design.snds.mailbird`). The first launch as
//! Vale moves that folder to the new id, so mail, notes and settings stay.

use std::path::Path;

/// The app id before the rename.
pub const LEGACY_ID: &str = "design.snds.mailbird";

/// Moves the old data folder (a sibling of `data_dir` named [`LEGACY_ID`])
/// into place, if there's one and nothing is at `data_dir` yet. Returns
/// whether it moved.
pub fn adopt_legacy_dir(data_dir: &Path) -> std::io::Result<bool> {
    let Some(old) = data_dir.parent().map(|p| p.join(LEGACY_ID)) else { return Ok(false) };
    if data_dir.exists() || !old.is_dir() {
        return Ok(false);
    }
    std::fs::rename(&old, data_dir)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_old_folder_moves_once_and_never_over_new_data() {
        let root = std::env::temp_dir().join(format!("legacy-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let (old, new) = (root.join(LEGACY_ID), root.join("design.snds.vale"));
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("pim.sqlite3"), b"mail").unwrap();
        assert!(adopt_legacy_dir(&new).unwrap());
        assert_eq!(std::fs::read(new.join("pim.sqlite3")).unwrap(), b"mail");
        assert!(!old.exists());
        assert!(!adopt_legacy_dir(&new).unwrap(), "nothing left to move");

        // Data already under the new id is never replaced.
        std::fs::create_dir_all(&old).unwrap();
        assert!(!adopt_legacy_dir(&new).unwrap());
        assert!(old.exists() && new.join("pim.sqlite3").exists());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
