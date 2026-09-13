# Québec French translation review

Status: PENDING HUMAN TRANSLATION REVIEW

This catalogue is a complete draft for the React client and the existing
application-label catalogue. An owner who is fluent in Québec French must
review every row before task 1187B is marked complete or the French locale is
presented as approved.

The client stores the language as `fr` and combines it with the account region
(`CA`) to format `fr-CA`. The Borrowers UI deliberately keeps the
compatibility boundary: the existing API and database use customer/customer
codes, while user-facing French consistently uses **emprunteur** and
**emprunteurs**. Do not replace that glossary with client, lecteur, or membre.

Missing label codes fall back explicitly to English in `LocaleProvider`; raw
catalogue codes must never be rendered. Interpolation placeholders in each row
must remain unchanged while wording is reviewed.

## Row-by-row review

| Code | English fallback | Québec French draft |
| --- | --- | --- |
| ADD_BOOK | Add book | Ajouter un livre |
| ADD_BOOK_MANUALLY | Add book manually | Ajouter un livre manuellement |
| STOCK_CODE | Stock code | Code de l’exemplaire |
| CODE | Code | Code |
| STOCKS | Stocks | Exemplaires |
| CLOSE | Close | Fermer |
| DELETE | Delete | Supprimer |
| CANCEL | Cancel | Annuler |
| SAVE | Save | Enregistrer |
| EDIT | Edit | Modifier |
| GENERATE_REPORT | Generate report | Générer le rapport |
| LOAN_REPORT_TITLE | Loan report | Rapport de prêts |
| CUSTOMER | Customer | Emprunteur |
| ALL_CUSTOMERS | All customers | Tous les emprunteurs |
| RETURNED_ON | Returned on | Retourné le |
| STILL_ON_LOAN | Still on loan | Encore prêté |
| NO_LOANS_FOUND | No loans found for the selected filters | Aucun prêt ne correspond aux filtres sélectionnés |
| ADD | Add | Ajouter |
| UPDATE | Update | Mettre à jour |
| ACTIONS | Actions | Actions |
| ADD_AND_PRINT | Add & print | Ajouter et imprimer |
| PRINT_QUEUE | Printer queue | File d’impression |
| TOTAL_LABELS_TO_PRINT | Total labels to print: | Total des étiquettes à imprimer : |
| CLEAR_QUEUE | Clear queue | Vider la file |
| PRINT | Print | Imprimer |
| SNACKBAR_PRINT_LABEL_ALREADY_ADDED | Label already added into the queue | L’étiquette est déjà dans la file |
| SNACKBAR_PRINT_LABEL_ADDED | Label added into the queue | Étiquette ajoutée à la file |
| SEARCH_BOOKS | Search books | Rechercher des livres |
| DASHBOARD | Dashboard | Tableau de bord |
| LIBRARY | Library | Bibliothèque |
| IMAGE | Image | Image |
| LOCATIONS | Locations | Emplacements |
| LOCATION | Location | Emplacement |
| NO_LOCATION | [No location] | [Aucun emplacement] |
| CATEGORIES | Categories | Catégories |
| CATEGORY | Category | Catégorie |
| CUSTOMERS | Customers | Emprunteurs |
| AUTHORS | Authors | Auteurs |
| SETTINGS | Settings | Paramètres |
| LOG_OUT | Log out | Fermer la session |
| HELP | Help | Aide |
| SCAN_BARCODE | Scan barcode | Scanner le code-barres |
| ERROR_OCCURRED | An error has occurred | Une erreur est survenue |
| SNACKBAR_NEW_AUTHOR_ADDED | New author added: | Nouvel auteur ajouté : |
| SNACKBAR_AUTHOR_DELETED | Author has been deleted successfully | Auteur supprimé avec succès |
| BOOK | Book | Livre |
| SNACKBAR_NEW_CATEGORY_ADDED | Category was been added successfully | Catégorie ajoutée avec succès |
| SNACKBAR_DELETED_CATEGORY | Category was been deleted successfully | Catégorie supprimée avec succès |
| SNACKBAR_NEW_CUSTOMER_ADDED | Customer has been added successfully | Nouvel emprunteur ajouté : |
| SNACKBAR_DELETED_CUSTOMER | Customer has been deleted successfully | Emprunteur supprimé avec succès |
| SNACKBAR_NEW_LOCATION_ADDED | Location has been added successfully | Emplacement ajouté avec succès |
| SNACKBAR_LOCATION_UPDATED | Location has been updated successfully | Emplacement mis à jour avec succès |
| SNACKBAR_DELETED_LOCATION | Location has been deleted successfully | Emplacement supprimé avec succès |
| SNACKBAR_AUTHOR_UPDATED | Author updated successfully | Auteur mis à jour avec succès |
| SNACKBAR_BOOK_STOCK_ADDED | Book stock has been added | Exemplaire ajouté |
| SNACKBAR_BOOK_STOCK_DELETED | Book stock deleted successfully | Exemplaire supprimé avec succès |
| SNACKBAR_BOOK_STOCK_UPDATED | Book stock updated successfully | Exemplaire mis à jour avec succès |
| SNACKBAR_BOOK_UPDATED | Book updated successfully | Livre mis à jour avec succès |
| SNACKBAR_BOOK_IMAGE_UPDATED | Book image has been changed | Image du livre modifiée |
| SNACKBAR_BOOK_DELETED | Book has been deleted | Livre supprimé |
| BOOKED | Booked | Réservé |
| AVAILABLE | Available | Disponible |
| NOT_AVAILABLE | Not available | Indisponible |
| DAMAGE | Damage | Dommage |
| SNACKBAR_CATEGORY_UPDATED | Category was updated successfully | Catégorie mise à jour avec succès |
| SNACKBAR_PROFILE_UPDATED | Profile information updated successfully | Informations du profil mises à jour avec succès |
| SNACKBAR_PROFILE_IMAGE_DELETED | Profile image has been removed successfully | Image du profil supprimée avec succès |
| SNACKBAR_PROFILE_IMAGE_UPDATED | Profile image has been updated successfully | Image du profil mise à jour avec succès |
| EDIT_AUTHOR | Edit author | Modifier l’auteur |
| ADD_AUTHOR | Add author | Ajouter un auteur |
| NAME | Name | Nom |
| DELETE_AUTHOR_TITLE | Delete author  | Supprimer cet auteur |
| DELETE_AUTHOR_DESC | Are you sure that you want to remove this author? | Voulez-vous vraiment supprimer cet auteur ? |
| IMAGE_DRAG_AND_DROP | Drag and drop an image | Glissez-déposez une image |
| BOOK_HOVER_INFO | (Hover to change book image) | (Survolez pour modifier la couverture du livre) |
| EDIT_BOOK_STOCK | Edit book stock | Modifier l’exemplaire |
| OVERVIEW | Overview | Aperçu |
| BOOKED_BOOKS | Booked books | Livres réservés |
| ADD_BOOK_STOCK | Add book stock | Ajouter un exemplaire |
| BOOK_HAS_BEEN_ADDED | Book "{{name}" has been added | Livre « {name} » ajouté |
| ONLY_IMAGES_ALLOWED | Only images are allowed | Seules les images sont autorisées |
| BOOK_STOCK_INFO | Book stock represents individual copies of a book, allowing you to track quantity and status. Each book stock has a unique barcode for identification. Please ensure the stock barcode is added to the book. | Un exemplaire représente une copie individuelle d’un livre et permet d’en suivre la quantité et l’état. Chaque exemplaire possède un code-barres unique pour l’identifier. Assurez-vous d’ajouter le code-barres de l’exemplaire au livre. |
| BOOK_STOCK_STATUS | Status | État |
| BOOKED_BY | Booked by | Réservé par |
| DELETE_STOCK | Delete stock | Supprimer l’exemplaire |
| DELETE_STOCK_DESC | Are you sure that you want to remove this book stock? | Voulez-vous vraiment supprimer cet exemplaire ? |
| LANGUAGE | Language | Langue |
| FORMAT | Format | Format |
| PAGES | Pages | Pages |
| PUBLISHER | Publisher | Éditeur |
| PUBLISHED_DATE | Published date | Date de publication |
| DESCRIPTION | Description | Description |
| DELETE_BOOK | Delete book  | Supprimer le livre  |
| DELETE_BOOK_DESC | Are you sure that you want to delete this book? | Voulez-vous vraiment supprimer ce livre ? |
| EBOOK_FILE | Ebook files | Fichiers de livres numériques |
| EBOOK_FILE_DRAG_AND_DROP | Drag and drop an epub, pdf or Kindle file | Glissez-déposez un fichier EPUB, PDF ou Kindle |
| EBOOK_FILE_HOVER_INFO | (Backup copy in case you lose your e-reader) | (Copie de sauvegarde au cas où vous perdriez votre liseuse) |
| ONLY_EBOOK_FILES_ALLOWED | Only EPUB, PDF or Kindle files are allowed | Seuls les fichiers EPUB, PDF ou Kindle sont autorisés |
| PREVIEW_UNAVAILABLE | Preview unavailable | Aperçu indisponible |
| FILE_TOO_LARGE | File is too large (max 100MB) | Le fichier est trop volumineux (max. 100 Mo) |
| DOWNLOAD | Download | Télécharger |
| FULLSCREEN | Fullscreen | Plein écran |
| EXIT_FULLSCREEN | Exit fullscreen | Quitter le plein écran |
| SNACKBAR_BOOK_FILE_UPLOADED | Ebook file uploaded | Fichier de livre numérique téléversé |
| SNACKBAR_BOOK_FILE_DELETED | Ebook file deleted | Fichier de livre numérique supprimé |
| DELETE_FILE | Delete file  | Supprimer le fichier |
| DELETE_FILE_DESC | Are you sure that you want to delete this ebook file? | Voulez-vous vraiment supprimer ce fichier de livre numérique ? |
| DELETE_CATEGORY | Delete category  | Supprimer la catégorie |
| DELETE_CATEGORY_DESC | Are you sure that you want to remove this category ? | Voulez-vous vraiment supprimer cette catégorie ? |
| ADD_A_BOOK | Add a Book | Ajouter un livre |
| REMOVE_BOOK | Remove book | Supprimer le livre |
| REMOVE_BOOK_DESC | Are you sure that you want to remove this book from this customer ? | Voulez-vous vraiment retirer ce livre à cet emprunteur ? |
| EDIT_CUSTOMER | Edit customer | Modifier l’emprunteur |
| ADD_CUSTOMER | Add customer | Ajouter un emprunteur |
| TOTAL_BOOKS | Total books | Total des livres |
| DELETE_CUSTOMER | Delete customer  | Supprimer l’emprunteur |
| DELETE_CUSTOMER_DESC | Are you sure that you want to remove this customer? | Voulez-vous vraiment supprimer cet emprunteur ? |
| DASHBOARD_BOOKS_ADDED_TIME_OVER_TIME | Books Added Over Time | Livres ajoutés au fil du temps |
| DASHBOARD_TOTAL | Total | Total |
| RETURN_BOOKS | Return books | Retourner les livres |
| SNACKBAR_RETURN_BOOKS | Books has been returned successfully | Livres retournés avec succès |
| RETURN | Return | Retourner |
| DASHBOARD_CHART | Chart | Graphique |
| DASHBOARD_LAST_BOOKS | Last books | Derniers livres |
| DASHBOARD_HERO_PREFIX | You have | Vous avez |
| DASHBOARD_HERO_SUFFIX | new books this month | nouveaux livres ce mois-ci |
| DASHBOARD_ALL_CATEGORIES | All | Tous |
| DASHBOARD_BROWSE_CATEGORIES | Browse by category | Parcourir par catégorie |
| DASHBOARD_ON_LOAN | Currently on loan | Actuellement prêtés |
| DASHBOARD_LOANED_TO | Loaned to | Prêté à |
| DASHBOARD_NO_LOANS | Nothing out right now | Rien n’est prêté pour l’instant |
| LOANS | Loans | Prêts |
| LOANED_ON | Loaned on | Prêté le |
| DATE_FROM | From | Du |
| DATE_TO | To | Au |
| ALL_GROUPS | All groups | Tous les groupes |
| EMPTY_LOANS_TITLE | No books on loan | Aucun livre prêté |
| EMPTY_LOANS_DESC | Books currently loaned to a customer will show up here. | Les livres actuellement prêtés à un emprunteur apparaîtront ici. |
| VIEW_ALL | View all | Voir tout |
| DASHBOARD_LOANS_NOTE | Showing the 5 most recent loans | Affichage des 5 prêts les plus récents |
| EDIT_LOCATION | Edit location | Modifier l’emplacement |
| ADD_LOCATION | Add location | Ajouter un emplacement |
| DELETE_LOCATION | Delete location  | Supprimer l’emplacement |
| DELETE_LOCATION_DESC | Are you sure that you want to remove this location ? | Voulez-vous vraiment supprimer cet emplacement ? |
| NOT_FOUND_DESC | The page was not found. | La page est introuvable. |
| NOT_FOUND_GO_HOME | Go to home | Aller à l’accueil |
| ADD_BOOK_ISBN | Add book (ISBN) | Ajouter un livre (ISBN) |
| ADD_BOOK_ISBN_DESC | Easily add a book to your library by entering its ISBN code. The app will automatically fetch the book's details, including title, author, description, and more, and seamlessly add it to your collection. | Ajoutez facilement un livre à votre bibliothèque en saisissant son code ISBN. L’application récupérera automatiquement ses détails, notamment le titre, l’auteur et la description, puis l’ajoutera à votre collection. |
| ISBN_CODE | ISBN code | Code ISBN |
| INVALID_ISBN_CODE | Invalid ISBN format. Please enter a valid ISBN-10 or ISBN-13. | Format ISBN invalide. Veuillez saisir un ISBN-10 ou un ISBN-13 valide. |
| ISBN_BOOK_NOT_FOUND | Book not found | Livre introuvable |
| ISBN_ADD_ERROR | Error while adding the book | Erreur lors de l’ajout du livre |
| DRAG_AND_DROP_BOOK_COVER | Drag and drop book cover | Glissez-déposez la couverture du livre |
| USERCONF_CHANGE_PASSWORD | Change password | Changer le mot de passe |
| USERCONF_CURRENT_PASSWORD | Current password | Mot de passe actuel |
| USERCONF_NEW_PASSWORD | New password | Nouveau mot de passe |
| USERCONF_MY_PROFILE | My profile | Mon profil |
| USERCONF_PASSWORD_SECURITY | Please add all necessary characters to create safe password. | Ajoutez tous les caractères nécessaires pour créer un mot de passe sûr. |
| USERCONF_PASSWORD_MINIMUM_CHAR | At least 8 characters | Au moins 8 caractères |
| USERCONF_PASSWORD_UPPERCASE | At least one uppercase letter | Au moins une lettre majuscule |
| USERCONF_PASSWORD_ONE_NUMBER | At least one number | Au moins un chiffre |
| USERCONF_PASSWORD_SPECIAL_CHAR | At least one special character | Au moins un caractère spécial |
| USEERCONF_PASSWORD_REPEAT | Repeat new password | Répéter le nouveau mot de passe |
| USERCONF_PASSWORD_NOT_MATCH | Passwords do not match! | Les mots de passe ne correspondent pas ! |
| USERCONF_PASSWORD_CHANGED | Password changed successfully | Mot de passe modifié avec succès |
| USERCONF_CHANGE_IMAGE | Change image | Changer l’image |
| USERCONF_REMOVE_IMAGE | Remove image | Supprimer l’image |
| USERCONF_IMAGE_SUPPORT | We only support PNGs, JPGs under 2MB | Seuls les fichiers PNG et JPG de moins de 2 Mo sont acceptés |
| USERCONF_NAME | Name | Nom |
| USERCONF_LANGUAGE_REGION | Language & Region | Langue et région |
| USERCONF_LANGUAGE | Language | Langue |
| USERCONF_REGION | Region | Région |
| USERCONF_ACCOUNT_SECURITY | Account Security | Sécurité du compte |
| USERCONF_EMAIL | Email | Courriel |
| USERCONF_EMAIL_DESC | Used to sign in and for account notifications. | Utilisé pour ouvrir une session et recevoir les notifications du compte. |
| USERCONF_CHANGE_PASSWORD_DESC | Update your account password to keep your account secure. You’ll need to enter your current password and choose a new one that meets security requirements. | Mettez à jour le mot de passe de votre compte pour le protéger. Vous devrez saisir votre mot de passe actuel et en choisir un nouveau qui respecte les exigences de sécurité. |
| USERCONF_DELETE_DESC | Permanently delete the account and remove workspace and books. | Supprimez définitivement le compte, l’espace de travail et les livres. |
| USERCONF_DELETE | Delete account | Supprimer compte |
| USERCONF_DELETE_USER_TITLE | Delete user | Supprimer l’utilisateur |
| USERCONF_DELETE_USER_DESC | Are you sure you want to delete your Vaultisse account? This will permanently remove your account and all associated content. | Voulez-vous vraiment supprimer votre compte Vaultisse ? Cette action supprimera définitivement votre compte et tout son contenu. |
| USERCONF_APPEARANCE | Appearance | Apparence |
| USERCONF_THEME_BEIGE | Reading Room | Salle de lecture |
| USERCONF_THEME_BEIGE_DESC | Warm, light, and paper-toned. | Ambiance chaleureuse, claire et aux tons papier. |
| USERCONF_THEME_LIBRARY | Open Shelf | Étagère ouverte |
| USERCONF_THEME_LIBRARY_DESC | Dark, cool-toned, easy on the eyes at night. | Sombre, aux tons froids et reposant pour les yeux le soir. |
| USERCONF_COMPACT_MENU | Compact menu | Menu compact |
| USERCONF_COMPACT_MENU_DESC | Collapse the sidebar to icons only, expanding it when you hover over it. | Réduire la barre latérale aux icônes et la développer au survol. |
| SNACKBAR_APPEARANCE_UPDATED | Appearance updated | Apparence mise à jour |
| USERCONF_FEATURES | Features | Fonctionnalités |
| USERCONF_LEASING | Leasing | Prêts |
| USERCONF_LEASING_DESC | Track who's borrowing what. Turns on the Loans and Customers pages in the sidebar. | Suivre qui emprunte quoi. Active les pages Prêts et Emprunteurs dans la barre latérale. |
| SNACKBAR_LEASING_UPDATED | Leasing preference updated | Préférence de prêt mise à jour |
| USERCONF_SESSIONS | Active sessions | Sessions actives |
| USERCONF_SESSIONS_DESC | Devices currently signed in to your account. | Appareils actuellement connectés à votre compte. |
| USERCONF_SESSIONS_EMPTY | No active sessions | Aucune session active |
| USERCONF_SESSION_CURRENT | This device | Cet appareil |
| USERCONF_SESSION_LOG_OUT | Log out | Fermer la session |
| USERCONF_SESSION_LAST_ACTIVE | Last active | Dernière activité |
| USERCONF_SESSION_LOGOUT_TITLE | Log out this device? | Fermer la session sur cet appareil ? |
| USERCONF_SESSION_LOGOUT_DESC | This device will be signed out immediately. | La session de cet appareil sera fermée immédiatement. |
| SNACKBAR_SESSION_REVOKED | Device signed out | Session fermée sur l’appareil |
| USERCONF_LOGIN_ACTIVITY | Recent logins | Connexions récentes |
| USERCONF_LOGIN_ACTIVITY_DESC | The last sign-ins to your account. | Les dernières connexions à votre compte. |
| USERCONF_LOGIN_ACTIVITY_EMPTY | No login activity yet | Aucune activité de connexion pour l’instant |
| ACTIVITY_LOGIN | Signed in | Connecté |
| ACTIVITY_LOGIN_FAILED | Failed sign-in attempt | Tentative de connexion échouée |
| ACTIVITY_LOGOUT | Signed out | Déconnecté |
| ACTIVITY_PASSWORD_CHANGED | Password changed | Mot de passe modifié |
| DEVICE_UNKNOWN | Unknown device | Appareil inconnu |
| TWOFA_TITLE | Two-factor authentication | Authentification à deux facteurs |
| TWOFA_DESC | Require a code from an authenticator app when signing in. | Exiger un code d’une application d’authentification lors de la connexion. |
| TWOFA_STATUS_ENABLED | Enabled | Activée |
| TWOFA_STATUS_DISABLED | Disabled | Désactivée |
| TWOFA_ENABLE | Enable | Activer |
| TWOFA_DISABLE | Disable | Désactiver |
| TWOFA_SETUP_TITLE | Set up two-factor authentication | Configurer l’authentification à deux facteurs |
| TWOFA_SETUP_SCAN_DESC | Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, ...), then enter the 6-digit code it shows. | Scannez ce code QR avec une application d’authentification (Google Authenticator, Authy, 1Password, etc.), puis saisissez le code à 6 chiffres affiché. |
| TWOFA_SETUP_MANUAL_KEY | Or enter this key manually: | Ou saisissez cette clé manuellement : |
| TWOFA_CODE | Verification code | Code de vérification |
| TWOFA_INVALID_CODE | Invalid code. Please try again. | Code invalide. Veuillez réessayer. |
| TWOFA_BACKUP_CODES_TITLE | Save your backup codes | Enregistrer vos codes de récupération |
| TWOFA_BACKUP_CODES_DESC | Each code can be used once to sign in if you lose access to your authenticator app. Store them somewhere safe - they won't be shown again. | Chaque code ne peut être utilisé qu’une fois pour ouvrir une session si vous perdez l’accès à votre application d’authentification. Conservez-les en lieu sûr : ils ne seront plus affichés. |
| TWOFA_SAVED_CODES_CONFIRM | I've saved these codes | J’ai enregistré ces codes |
| TWOFA_DISABLE_TITLE | Disable two-factor authentication | Désactiver l’authentification à deux facteurs |
| TWOFA_DISABLE_DESC | Enter your password to disable two-factor authentication. Your backup codes will stop working. | Saisissez votre mot de passe pour désactiver l’authentification à deux facteurs. Vos codes de récupération cesseront également de fonctionner. |
| TWOFA_DISABLE_PASSWORD | Password | Mot de passe |
| TWOFA_ENABLED_SNACKBAR | Two-factor authentication enabled | Authentification à deux facteurs activée |
| TWOFA_DISABLED_SNACKBAR | Two-factor authentication disabled | Authentification à deux facteurs désactivée |
| USERCONF_IMAGE_FORMAT_ALERT | Please upload a PNG or JPEG image. | Veuillez téléverser une image PNG ou JPEG. |
| EDIT_CATEGORY | Edit category | Modifier la catégorie |
| ADD_CATEGORY | Add category | Ajouter une catégorie |
| USERCONF_IMAGE_SIZE_ALERT | File size must be less than 2MB | La taille du fichier doit être inférieure à 2 Mo. |
| ADD_FILTER | Add filter | Ajouter un filtre |
| NO_STOCK_FILTER | No stock | Aucun exemplaire |
| HAS_STOCK_FILTER | Has stock | A des exemplaires |
| ON_LOAN_FILTER | On loan | Prêté |
| RECENT_FILTER | Recent | Récent |
| UPLOAD_DATE_FILTER | Upload date | Date de téléversement |
| CATEGORY_FILTER | Category | Catégorie |
| ALL_CATEGORIES | All categories | Toutes les catégories |
| GROUP_BY_CATEGORY | Group by category | Regrouper par catégorie |
| UNCATEGORIZED | Uncategorized | Non catégorisé |
| SORT_BY | Sort by | Trier par |
| SORT_NAME_ASC | Name (A-Z) | Nom (A à Z) |
| SORT_NAME_DESC | Name (Z-A) | Nom (Z à A) |
| SORT_DATE_NEWEST | Newest first | Plus récent en premier |
| SORT_DATE_OLDEST | Oldest first | Plus ancien en premier |
| APPLY | Apply | Appliquer |
| CLEAR | Clear | Effacer |
| GROUPS | Groups | Groupes |
| GROUP | Group | Groupe |
| NO_GROUP | No group | Aucun groupe |
| NO_MEMBERS | No members | Aucun emprunteur |
| MANAGE_GROUPS | Manage groups | Gérer les groupes |
| ADD_GROUP | Add group | Ajouter un groupe |
| EDIT_GROUP | Edit group | Modifier le groupe |
| DELETE_GROUP | Delete group | Supprimer le groupe |
| DELETE_GROUP_DESC | Are you sure that you want to remove this group? Customers in this group will not be deleted. | Voulez-vous vraiment supprimer ce groupe ? Les emprunteurs de ce groupe ne seront pas supprimés. |
| GROUP_MEMBERS | Group members | Emprunteurs du groupe |
| ADD_MEMBERS_TO_GROUP | Add members | Ajouter des emprunteurs |
| TOTAL_CUSTOMERS | Customers | Emprunteurs |
| SNACKBAR_NEW_GROUP_ADDED | Group added | Groupe ajouté |
| SNACKBAR_GROUP_UPDATED | Group updated | Groupe mis à jour |
| SNACKBAR_DELETED_GROUP | Group deleted | Groupe supprimé |
| MOVE_TO_GROUP | Move to group | Déplacer vers un groupe |
| MOVE | Move | Déplacer |
| SELECTED | selected | sélectionnés |
| GROUPS_DRAG_DROP_HINT | Drag and drop customers between groups, or select multiple to move them at once. | Déplacez les emprunteurs entre les groupes, ou sélectionnez-en plusieurs pour les déplacer ensemble. |
| EMPTY_LIBRARY_TITLE | Add your first book | Ajoutez votre premier livre |
| EMPTY_LIBRARY_DESC | Scan an ISBN or add a book manually to start building your library. | Scannez un ISBN ou ajoutez un livre manuellement pour commencer votre bibliothèque. |
| EMPTY_LOCATIONS_TITLE | Add your first location | Ajoutez votre premier emplacement |
| EMPTY_LOCATIONS_DESC | Create shelves, rooms or branches to organize where your books live. | Créez des étagères, des pièces ou des succursales pour organiser vos livres. |
| EMPTY_CUSTOMERS_TITLE | Add your first customer | Ajoutez votre premier emprunteur |
| EMPTY_CUSTOMERS_DESC | Add customers to start lending and tracking your books. | Ajoutez des emprunteurs pour commencer à prêter et à suivre vos livres. |
| EMPTY_CATEGORIES_TITLE | Add your first category | Ajoutez votre première catégorie |
| EMPTY_CATEGORIES_DESC | Create categories to organize and classify your books. | Créez des catégories pour organiser et classer vos livres. |
| EMPTY_AUTHORS_TITLE | Add your first author | Ajoutez votre premier auteur |
| EMPTY_AUTHORS_DESC | Add authors to link them to the books in your library. | Ajoutez des auteurs pour les associer aux livres de votre bibliothèque. |
| EMPTY_LAST_BOOKS_TITLE | No books yet | Aucun livre pour l’instant |
| EMPTY_LAST_BOOKS_DESC | Books you add will show up here. | Les livres que vous ajoutez apparaîtront ici. |
| PUBLIC_INSTITUTION_SENSITIVE_DATA_WARNING | This account is registered as a public institution. Avoid entering sensitive personal information here — use student codes or IDs that only you can identify instead of full names. | Ce compte est enregistré comme institution publique. Évitez d’entrer ici des renseignements personnels sensibles — utilisez plutôt des codes ou identifiants d’élèves que vous seul pouvez reconnaître, plutôt que des noms complets. |
| DISMISS | Dismiss | Fermer |
| NAV_MAIN | Main | Navigation principale |
| THEME_SWITCH | Switch to {next} theme | Passer au thème {next} |
| NAV_OPEN | Open navigation | Ouvrir la navigation |
| NAV_CLOSE | Close navigation | Fermer la navigation |
| LOADING | Loading… | Chargement… |
| SCREEN_ERROR_TITLE | This did not load | Échec du chargement |
| TRY_AGAIN | Try again | Réessayer |
| NO_SHELF | No shelf | Aucune étagère |
| EDIT_COPY | Edit copy {code} | Modifier l’exemplaire {code} |
| COPIES | Copies | Exemplaires |
| ADD_COPY | Add a copy | Ajouter un exemplaire |
| NO_PHYSICAL_COPIES | No physical copies yet. Add one to put this book on a shelf. | Aucun exemplaire physique pour l’instant. Ajoutez-en un pour placer ce livre sur une étagère. |
| COPY_CODE_TITLE | Copy {code} | Exemplaire {code} |
| EDIT_COPY_DESC | Move it to another shelf, change its state, or discard it. | Déplacez-le vers une autre étagère, modifiez son état ou mettez-le au rebut. |
| ADD_COPY_DESC | A scannable code is generated for the new copy automatically. | Un code numérisable est généré automatiquement pour le nouvel exemplaire. |
| SAVING | Saving… | Enregistrement… |
| SAVE_COPY | Save copy | Enregistrer l’exemplaire |
| ADD_COPY_SHORT | Add copy | Ajouter un exemplaire |
| STATE | State | État |
| SHELF | Shelf | Étagère |
| CHOOSE_SHELF | Choose a shelf | Choisir une étagère |
| LENT_TO | Lent to | Prêté à |
| NOBODY_YET | Nobody yet | Personne pour l’instant |
| DISCARD_COPY_CONFIRM | Discard copy {code}? Its loan history is kept, the copy is not. | Mettre l’exemplaire {code} au rebut ? Son historique de prêts est conservé, mais l’exemplaire est supprimé. |
| DISCARDING | Discarding… | Mise au rebut… |
| YES_DISCARD | Yes, discard it | Oui, le mettre au rebut |
| KEEP_IT | Keep it | Conserver |
| DISCARD_COPY | Discard this copy | Mettre cet exemplaire au rebut |
| ISBN_VALUE | ISBN {isbn} | ISBN {isbn} |
| TITLE | Title | Titre |
| TITLE_REQUIRED | A title is required. | Le titre est obligatoire. |
| ISBN | ISBN | ISBN |
| UNCATEGORISED | Uncategorised | Non catégorisé |
| NOT_SET | Not set | Non défini |
| PUBLISHED | Published | Publié |
| EBOOK_FILES | Ebook files | Fichiers de livres numériques |
| UPLOADING | Uploading… | Téléversement… |
| ADD_FILE | Add a file | Ajouter un fichier |
| NO_BACKUP_FILE | No backup file yet. EPUB, PDF or Kindle, up to {max}MB. | Aucun fichier de sauvegarde pour l’instant. EPUB, PDF ou Kindle, jusqu’à {max} Mo. |
| REMOVE_FILE | Remove {file_name} | Supprimer {file_name} |
| REMOVE | Remove | Supprimer |
| REMOVE_FILE_TITLE | Remove this file? | Supprimer ce fichier ? |
| REMOVING | Removing… | Suppression… |
| REMOVE_FILE_DESC | The catalogue entry stays; only the backed-up file is deleted. | L’entrée du catalogue est conservée; seul le fichier sauvegardé est supprimé. |
| REMOVE_AUTHOR | Remove {name} | Supprimer {name} |
| AUTHORS_LIST_NOT_LOADED | The author list did not load, so authors cannot be changed right now. | La liste des auteurs n’a pas été chargée; il est impossible de les modifier pour l’instant. |
| LOADING_AUTHORS | Loading authors… | Chargement des auteurs… |
| EVERY_AUTHOR_SELECTED | Every author is already on this book | Tous les auteurs sont déjà associés à ce livre |
| ADD_AUTHOR_OPTION | Add an author… | Ajouter un auteur… |
| AUTHOR_PICKER_HELP | New authors are created on the authors screen, or automatically by an ISBN lookup. | Les nouveaux auteurs sont créés à l’écran Auteurs ou automatiquement lors d’une recherche par ISBN. |
| BOOK_COVER_ALT | Cover of {title} | Couverture de {title} |
| REPLACE_COVER | Replace cover | Remplacer la couverture |
| ADD_COVER | Add a cover | Ajouter une couverture |
| LOADING_BOOK | Loading this book… | Chargement de ce livre… |
| BOOK_NOT_LOADED | This book did not load | Ce livre n’a pas été chargé |
| DELETE_BOOK_TITLE | Delete this book? | Supprimer ce livre ? |
| DELETING | Deleting… | Suppression… |
| DELETE_BOOK_DESCRIPTION | This removes the catalogue entry, its {count} copies and any backed-up files. It cannot be undone. | Cette action supprime l’entrée du catalogue, ses {count} exemplaires et les fichiers sauvegardés. Elle est irréversible. |
| AUTHOR_NAME_PLACEHOLDER | e.g. Ursula K. Le Guin | p. ex. Ursula K. Le Guin |
| CATALOGUE | Catalogue | Catalogue |
| AUTHOR | author | Auteur |
| AUTHORS_NOT_LOADED | The authors did not load | Les auteurs n’ont pas été chargés |
| AUTHORS_EMPTY | No authors yet | Aucun auteur pour l’instant |
| AUTHORS_EMPTY_DESC | Authors are shared across the library; adding a book is usually what creates one. | Les auteurs sont partagés dans toute la bibliothèque; l’ajout d’un livre en crée généralement un. |
| REFRESHING_METADATA | Refreshing metadata… | Refreshing métadonnées… |
| REFRESH_METADATA | Refresh metadata | Actualiser les métadonnées |
| REFRESH_METADATA_DESC | Fills missing details from book catalogues. Your existing details and cover are kept. | Complète les détails manquants à partir des catalogues de livres. Vos détails et votre couverture existants sont conservés. |
| REFRESH_METADATA_NO_ISBN | Use Edit to add a valid ISBN, then refresh metadata. | Utilisez Modifier pour ajouter un ISBN valide, puis actualisez les métadonnées. |
| CHECKING_CATALOGUES | Checking catalogues… | Vérification des catalogues… |
| CHECK_ISBN_RETRY | Check the ISBN or try again. | Vérifiez l’ISBN ou réessayez. |
| METADATA_UPDATED | Updated: {fields}. | Mis à jour : {fields}. |
| NO_NEW_METADATA | No new metadata found. | Aucune nouvelle métadonnée trouvée. |
| METADATA_STILL_MISSING | Still missing: {fields}. You can add these using Edit. | Encore manquant : {fields}. Vous pouvez les ajouter avec Modifier. |
| METADATA_SOURCES_FAILED | Some catalogues could not be reached. Try again later for missing details. | Certains catalogues sont inaccessibles. Réessayez plus tard pour obtenir les détails manquants. |
| ADMINISTRATOR | Administrator | Administrateur |
| MEMBER | Member | Membre |
| DISABLED | Disabled | Désactivé |
| NEVER_SIGNED_IN | Never signed in | Jamais connecté |
| YOU | You | Vous |
| DEMOTE_TO_MEMBER | Demote to member | Rétrograder comme membre |
| PROMOTE_TO_ADMIN | Promote to admin | Promouvoir comme administrateur |
| ENABLE_ACCOUNT | Enable account | Activer le compte |
| DISABLE_ACCOUNT | Disable account | Désactiver le compte |
| DELETE_ACCOUNT | Delete account | Supprimer le compte |
| LOADING_ACCOUNTS | Loading accounts… | Chargement des comptes… |
| ACCOUNTS_NOT_LOADED | Accounts did not load | Les comptes n’ont pas été chargés |
| ACCOUNT_COUNT | {count} account / {count} accounts | {count} compte / {count} comptes |
| DISABLED_COUNT |  · {count} disabled |  · {count} désactivés |
| NO_ACCOUNTS | No accounts | Aucun compte |
| NO_ACCOUNTS_DESC | Accounts appear here as people register. | Les comptes apparaissent ici au fil des inscriptions. |
| DELETE_ACCOUNT_TITLE | Delete {name}? | Supprimer {name} ? |
| DELETE_ACCOUNT_DESC | Their books, copies, authors, locations and loan history stay in the shared library — they only lose the “added by” attribution. | Leurs livres, exemplaires, auteurs, emplacements et historique de prêts restent dans la bibliothèque partagée; seule l’attribution « ajouté par » est supprimée. |
| CATEGORY_NAME_PLACEHOLDER | e.g. Science-fiction | p. ex. Science-fiction |
| LOADING_CATEGORIES | Loading categories… | Chargement des catégories… |
| CATEGORIES_NOT_LOADED | The categories did not load | Les catégories n’ont pas été chargées |
| CATEGORIES_EMPTY | No categories yet | Aucune catégorie pour l’instant |
| CATEGORIES_EMPTY_DESC | Categories group books by genre or shelving section, and drive the dashboard's shelves. | Les catégories regroupent les livres par genre ou par section de rangement et alimentent les sections du tableau de bord. |
| LOADING_SETTINGS | Loading settings… | Chargement des paramètres… |
| SETTINGS_NOT_LOADED | Settings did not load | Les paramètres n’ont pas été chargés |
| THEME_LIGHT | Light | Clair |
| THEME_DARK | Dark | Sombre |
| NEW_ACCOUNT_DEFAULTS_INTRO | These apply to the next account that registers. Changing one never alters an account that already exists. | Ces paramètres s’appliquent au prochain compte créé. Leur modification ne change jamais les comptes existants. |
| APPROVAL | Approval | Approbation |
| APPROVAL_DESC | Whether a new account can sign in straight away, or waits for an administrator. | Indique si un nouveau compte peut ouvrir une session immédiatement ou doit attendre l’approbation d’un administrateur. |
| REVIEW_NEW_ACCOUNTS | Review new accounts before they can sign in | Examiner les nouveaux comptes avant leur ouverture de session |
| REVIEW_NEW_ACCOUNTS_DESC | A new registration is created disabled and appears on the Accounts tab, where enabling it is how you approve it. | Une nouvelle inscription est créée comme désactivée et apparaît dans l’onglet Comptes; son activation constitue l’approbation. |
| APPROVAL_FROM_ENV | Currently set by the REGISTRATION_REQUIRES_APPROVAL environment variable. Changing it here takes over permanently. | Actuellement défini par la variable d’environnement REGISTRATION_REQUIRES_APPROVAL. Le modifier ici transfère définitivement le contrôle à ce paramètre. |
| FIRST_ACCOUNT_ADMIN | The very first account on an instance is always an enabled administrator — there would be nobody to approve it otherwise. | Le tout premier compte d’une instance est toujours un administrateur activé — autrement, personne ne pourrait l’approuver. |
| STARTING_PREFERENCES | Starting preferences | Préférences initiales |
| STARTING_PREFERENCES_DESC | What a new account's language, region and theme are set to. They can change all three from their own profile afterwards. | Détermine la langue, la région et le thème d’un nouveau compte. Il peut ensuite modifier ces trois paramètres dans son propre profil. |
| REGION | Region | Région |
| THEME | Theme | Thème |
| LOOKING_UP | Looking it up… | Recherche en cours… |
| ADDED_TO_LIBRARY | Added to the library. | Ajouté à la bibliothèque. |
| NO_METADATA_FOR_ISBN | No metadata found for this ISBN. Add it manually instead. | Aucune métadonnée trouvée pour cet ISBN. Ajoutez plutôt le livre manuellement. |
| BOOK_COULD_NOT_BE_ADDED | Could not be added. Try again. | Impossible d’ajouter le livre. Réessayez. |
| INVALID_ISBN | That is not a valid ISBN-10 or ISBN-13. | Cet ISBN-10 ou ISBN-13 n’est pas valide. |
| ISBN_ALREADY_QUEUED | That ISBN is already in the list. | Cet ISBN figure déjà dans la liste. |
| ADD_BOOKS_BY_ISBN | Add books by ISBN | Ajouter des livres par ISBN |
| ADD_BOOKS_BY_ISBN_DESC | Type or scan an ISBN and press Enter to queue it. Add as many as you like. | Saisissez ou numérisez un ISBN, puis appuyez sur Entrée pour le mettre en file. Ajoutez-en autant que vous le souhaitez. |
| ADDING | Adding… | Ajout… |
| ADD_PENDING | Add {count} / Add {count} | Ajouter {count} / Ajouter {count} |
| ISBN_PLACEHOLDER | e.g. 9780261102217 | p. ex. 9780261102217 |
| ADD_TO_LIST | Add to list | Ajouter à la liste |
| SHELVE_NEW_COPIES_AT | Shelve the new copies at | Ranger les nouveaux exemplaires à |
| DECIDE_LATER | Decide later | Décider plus tard |
| REFRESH_BOOK_METADATA | Refresh book metadata | Actualiser les métadonnées du livre |
| REFRESH_BOOK_METADATA_DESC | Choose up to 50 books to fill missing details from catalogues. Existing details and covers are kept. Some fields may remain missing. | Sélectionnez jusqu’à 50 livres pour compléter les détails manquants à partir des catalogues. Les détails et couvertures existants sont conservés. Certains champs peuvent rester manquants. |
| CHOOSE_BOOKS | Choose books | Choisir des livres |
| FIND_BOOKS_TITLE_ISBN | Find books by title or ISBN | Rechercher des livres par titre ou ISBN |
| LOADING_BOOKS | Loading books… | Chargement des livres… |
| RETRY_SEARCH | Retry search | Réessayer la recherche |
| NO_BOOKS_MATCH | No books match. Try another title or ISBN. | Aucun livre ne correspond. Essayez un autre titre ou ISBN. |
| NO_ISBN | no ISBN | sans ISBN |
| LOAD_MORE_BOOKS | Load more books | Charger plus de livres |
| BOOKS_SELECTED | {size} of 50 selected. Selection is kept when you search. | {size} sur 50 sélectionné(s). La sélection est conservée lorsque vous effectuez une recherche. |
| SELECTED_BOOKS | Selected: {books} | Sélectionnés : {books} |
| REFRESHING_BOOKS | Refreshing {count} book… / Refreshing {count} books… | Actualisation de {count} livre… / Actualisation de {count} livres… |
| REFRESH_SELECTED_BOOKS | Refresh {count} selected book / Refresh {count} selected books | Actualiser {count} livre sélectionné / Actualiser {count} livres sélectionnés |
| CLEAR_SELECTION | Clear selection | Effacer la sélection |
| CHECKING_BOOKS | Checking books one at a time. Large selections can take several minutes; keep this page open. | Vérification des livres un à la fois. Les grandes sélections peuvent prendre plusieurs minutes; gardez cette page ouverte. |
| REFRESH_PARTIAL_ERROR | Some books may already have refreshed. You can retry this selection; existing details are kept. | Certains livres ont peut-être déjà été actualisés. Vous pouvez réessayer cette sélection; les détails existants sont conservés. |
| REFRESH_RESULT_SUMMARY | {changed} changed · {unchanged} unchanged · {skipped} skipped or failed | {changed} modifiés · {unchanged} inchangés · {skipped} ignorés ou échoués |
| BOOK_ID | Book {id} | Livre {id} |
| ADMIN_METADATA_STILL_MISSING | Still missing: {fields}. Add these in the book details. | Encore manquant : {fields}. Ajoutez-les dans les détails du livre. |
| LENDING | Lending | Prêts |
| LENDING_SETTING_DESC | An instance-wide setting. Changing it changes the app for everyone who shares this library. | Paramètre général de l’instance. Sa modification touche tous les utilisateurs de cette bibliothèque. |
| TRACK_LOANS_BORROWERS | Track loans and borrowers | Suivre les prêts et les emprunteurs |
| TRACK_LOANS_BORROWERS_DESC | Adds the Loans and Borrowers sections. Turning it off hides them; nothing that has already been recorded is deleted. | Ajoute les sections Prêts et Emprunteurs. Si vous désactivez cette option, elles sont masquées; rien de ce qui a déjà été enregistré n’est supprimé. |
| ADD_BOOK_DESC | Only the title is required. Everything else can be filled in later. | Seul le titre est obligatoire. Tout le reste peut être rempli plus tard. |
| COVER | Cover | Couverture |
| CHOOSE_IMAGE | Choose an image | Choisir une image |
| IMAGE_FILE_HELP | PNG or JPEG, up to 4MB. | PNG ou JPEG, jusqu’à 4 Mo. |
| ADMIN | Admin | Administration |
| ADMIN_ACCOUNTS | Accounts | Comptes |
| ADMIN_LIBRARY | Library | Bibliothèque |
| ADMIN_NEW_ACCOUNTS | New accounts | Nouveaux comptes |
| ADMIN_FORBIDDEN | This page is for administrators. Your account is signed in and working — it just does not manage other accounts. | Cette page est réservée aux administrateurs. Votre compte est connecté et fonctionnel — il ne gère simplement pas les autres comptes. |
| ADMIN_FORBIDDEN_TITLE | You do not have access to this page | Vous n’avez pas accès à cette page |
| ADMINISTRATION | Administration | Administration |
| ADMIN_AFFECTS_OTHERS | Everything here affects other people. | Tout ce qui se trouve ici touche d’autres personnes. |
| ADMIN_SECTIONS | Admin sections | Sections d’administration |
| TREND_BOOK_ADDED | 1 book added | 1 livre ajouté |
| TREND_BOOKS_ADDED | {count} book added / {count} books added | {count} livre ajouté / {count} livres ajoutés |
| BOOKS_ADDED_PER_MONTH | Books added per month | Livres ajoutés par mois |
| TREND_NOTHING_ADDED | Nothing added yet — the trend appears once the library has its first book. | Aucun livre ajouté pour l’instant — la tendance apparaîtra dès l’ajout du premier livre à la bibliothèque. |
| ROW_ACTIONS_FOR | Actions for {entityName} | Actions pour {entityName} |
| CHOOSE_ACTION | Choose an action. | Choisir une action. |
| TREND_EMPTY | No books have been added yet. | Aucun livre n’a encore été ajouté. |
| TREND_ARIA | Books added per month, {span}. {books} in total. {detail}. | Livres ajoutés par mois, {span}. {books} au total. {detail}. |
| TREND_CAPTION_ONE | {books} in {fullLabel} | {books} dans {fullLabel} |
| TREND_CAPTION_RANGE | {books} over the last {length} months | {books} au cours des {length} derniers mois |
| LOADING_LIBRARY | Loading your library… | Chargement de votre bibliothèque… |
| DASHBOARD_NOT_LOADED | The dashboard did not load | Le tableau de bord n’a pas été chargé |
| WELCOME_BACK | Welcome back, {name} | Bon retour, {name} |
| RETURN_COPIES | Return copies | Retourner les exemplaires |
| RECENTLY_ADDED | Recently added | Ajoutés récemment |
| NOTHING_ADDED_YET | Nothing added yet | Rien n’a encore été ajouté |
| NOTHING_ADDED_DESC | Books added in the last 30 days show up here. | Les livres ajoutés au cours des 30 derniers jours apparaîtront ici. |
| CURRENTLY_ON_LOAN | Currently on loan | Actuellement prêté |
| NOTHING_OUT_MOMENT | Nothing is out at the moment. | Rien n’est prêté pour l’instant. |
| UNKNOWN_CATEGORY | Unknown category | Catégorie inconnue |
| SORT_TITLE_ASC | Title A–Z | Titre A–Z |
| SORT_TITLE_DESC | Title Z–A | Titre Z–A |
| SORT_NEWEST | Newest | Plus récents |
| SORT_OLDEST | Oldest | Plus anciens |
| HAS_COPIES | Has copies | Possède des exemplaires |
| NO_COPIES | No copies | Aucun exemplaire |
| ON_LOAN | On loan | Prêté |
| SEARCH_MATCHES | 1 book matches / {count} books match | 1 livre correspond / {count} livres correspondent |
| SEARCHING_LIBRARY | Searching the library… | Recherche dans la bibliothèque… |
| SEARCH | Search | Rechercher |
| SEARCH_TOTAL | 1 book / {count} books | 1 livre / {count} livres |
| ADD_BY_ISBN | Add by ISBN | Ajouter par ISBN |
| ADD_MANUALLY | Add manually | Ajouter manuellement |
| SCAN | Scan | Numériser |
| TITLE_OR_ISBN | Title or ISBN | Titre ou ISBN |
| SEARCH_LIBRARY_PLACEHOLDER | Search the library | Rechercher dans la bibliothèque |
| FILTERS_ACTIVE_ONE | Filters, 1 active | Filtres, 1 actif |
| FILTERS_ACTIVE | Filters, {activeCount} active | Filtres, {activeCount} actifs |
| FILTERS | Filters | Filtres |
| CLEAR_FILTERS | Clear filters | Effacer les filtres |
| SEARCH_NOT_LOADED | The search did not load | La recherche n’a pas été chargée |
| NOTHING_MATCHES_FILTERS | Nothing matches those filters | Aucun résultat ne correspond à ces filtres |
| LIBRARY_EMPTY | The library is empty | La bibliothèque est vide |
| FILTERS_EMPTY_DESC | Try clearing a filter, or widen the date range. | Essayez d’effacer un filtre ou d’élargir la période. |
| LIBRARY_EMPTY_DESC | Add a book by scanning its ISBN, or enter one by hand. | Ajoutez un livre en numérisant son ISBN ou saisissez-le manuellement. |
| LOAD_MORE | Load more ({shown} of {total}) | Charger davantage ({shown} sur {total}) |
| RECENT_SIGN_IN_ACTIVITY | Recent sign-in activity | Activité de connexion récente |
| RECENT_SIGN_IN_ACTIVITY_DESC | Sign-ins, sign-outs, password changes — and failed attempts against this account. | Connexions, déconnexions, changements de mot de passe — et tentatives échouées pour ce compte. |
| LOADING_ACTIVITY | Loading activity… | Chargement de l’activité… |
| ACTIVITY_NOT_LOADED | Activity did not load | L’activité n’a pas été chargée |
| NOTHING_RECORDED | Nothing recorded yet. | Rien d’enregistré pour l’instant. |
| COPY_STATUS | Copy status | État de l’exemplaire |
| NO_COPIES_TO_CLASSIFY | No copies to classify yet. | Aucun exemplaire à catégoriser pour l’instant. |
| CLEAR_ALL | Clear all | Tout effacer |
| DONE | Done | Terminé |
| ALL | All | Tous |
| ANY | Any | N’importe lequel |
| ADDED_RECENTLY | Added recently | Ajoutés récemment |
| ADDED_BETWEEN | Added between | Ajoutés entre |
| FROM | From | Du |
| TO | To | Au |
| DISPLAY | Display | Affichage |
| CANNOT_UNDO | This cannot be undone. | Cette action est irréversible. |
| RETURN_COPIES_DESC | Enter the code printed on each copy. One per line. | Saisissez le code imprimé sur chaque exemplaire. Un par ligne. |
| RETURNING | Returning… | Retour… |
| RETURN_COPIES_COUNT | Return {count} copy / Return {count} copies | Retourner {count} exemplaire / Retourner {count} exemplaires |
| RETURN_COPY | Return copy | Retourner un exemplaire |
| COPY_CODES | Copy codes | Codes des exemplaires |
| RETURN_COPY_CODE_PLACEHOLDER | e.g. BK-000123 | p. ex. BK-000123 |
| CODES_WILL_BE_RETURNED | {length} codes will be returned. | {length} codes seront retournés. |
| PROFILE | Profile | Profil |
| PROFILE_DESC | How you appear to everyone else sharing this library. | La façon dont vous apparaissez aux autres personnes qui partagent cette bibliothèque. |
| CHANGE_PICTURE | Change picture | Changer la photo |
| PROFILE_IMAGE_HELP | PNG or JPEG, up to 2MB. | PNG ou JPEG, jusqu’à 2 Mo. |
| EMAIL | Email | Courriel |
| SAVE_PROFILE | Save profile | Enregistrer le profil |
| PROFILE_SAVED | Saved. The interface language and region are active now. | Enregistré. La langue et la région de l’interface sont maintenant actives. |
| METADATA_SOURCE_NOT_CONFIGURED | Metadata source unavailable: {configured} Ask an administrator to check the configuration, or add the book manually. | Métadonnées indisponibles : {configured} Demandez à un administrateur de vérifier la configuration ou ajoutez le livre manuellement. |
| METADATA_SOURCES_UNAVAILABLE | The metadata sources were unavailable. Try again later. | Les sources de métadonnées sont indisponibles. Réessayez plus tard. |
| DASHBOARD_COUNTER_LIBRARY | {count} in the library / {count} in the library | {count} dans la bibliothèque / {count} dans la bibliothèque |
| DASHBOARD_COUNTER_RECENT | {count} added in the last 30 days / {count} added in the last 30 days | {count} ajouté au cours des 30 derniers jours / {count} ajoutés au cours des 30 derniers jours |
| DASHBOARD_COUNTER_OUT | {count} out / {count} out | {count} prêté / {count} prêtés |
| DASHBOARD_COUNTER_NO_COPIES | {count} with no copies / {count} with no copies | {count} sans exemplaire / {count} sans exemplaire |
| DASHBOARD_BOOKS | Books | Livres |
| DASHBOARD_ADDED_THIS_MONTH | Added this month | Ajoutés ce mois-ci |
| UP_ON_LAST_MONTH | up on last month | En hausse par rapport au mois dernier |
| DOWN_ON_LAST_MONTH | down on last month | En baisse par rapport au mois dernier |
| DASHBOARD_AUTHORS | Authors | Auteurs |
| CHANGE_PASSWORD | Change password | Changer le mot de passe |
| CHANGE_PASSWORD_DESC | Your other devices are signed out. This one stays signed in. | Vos autres appareils seront déconnectés. Celui-ci restera connecté. |
| CURRENT_PASSWORD | Current password | Mot de passe actuel |
| NEW_PASSWORD | New password | Nouveau mot de passe |
| PASSWORD_HINT | At least 8 characters, with an uppercase letter, a number and a special character. | Au moins 8 caractères, dont une majuscule, un chiffre et un caractère spécial. |
| REPEAT_NEW_PASSWORD | Repeat new password | Répéter le nouveau mot de passe |
| PASSWORDS_DO_NOT_MATCH | The two passwords do not match. | Les deux mots de passe ne correspondent pas. |
| PASSWORD_MISSING | That password is missing: | Mot de passe manquant : |
| TURN_OFF_2FA | Turn off two-factor authentication | Désactiver l’authentification à deux facteurs |
| TURN_OFF_2FA_DESC | Your backup codes are destroyed as well. Setting it up again issues a new set. | Vos codes de récupération seront également détruits. Une nouvelle configuration en générera un nouvel ensemble. |
| TURNING_OFF | Turning off… | Désactivation… |
| TURN_OFF | Turn off | Désactiver |
| ACCOUNT_PASSWORD | Account password | Mot de passe du compte |
| TWO_FACTOR_AUTH | Two-factor authentication | Authentification à deux facteurs |
| TWO_FACTOR_AUTH_DESC | A six-digit code from an authenticator app, on top of your password. | Un code à six chiffres provenant d’une application d’authentification, en plus de votre mot de passe. |
| ON | On | Activé |
| OFF | Off | Désactivé |
| TWO_FACTOR_ON_DESC | You are asked for a code after your password at every sign-in. | Un code vous sera demandé après votre mot de passe à chaque ouverture de session. |
| TWO_FACTOR_OFF_DESC | Anyone with your password can sign in as you. Any authenticator app works. | Toute personne qui connaît votre mot de passe peut ouvrir une session à votre place. N’importe quelle application d’authentification convient. |
| TURN_ON | Turn on | Activer |
| DELETE_ACCOUNT_CARD_DESC | Permanent. Your books stay in the shared library; only your account goes. | Définitif. Vos livres restent dans la bibliothèque partagée; seul votre compte est supprimé. |
| DELETE_MY_ACCOUNT | Delete my account | Supprimer mon compte |
| DELETE_YOUR_ACCOUNT | Delete your account? | Supprimer votre compte ? |
| DELETE_ACCOUNT_IMPACT | Everything you added to the library — books, copies, authors, locations, loan history — stays exactly where it is. It simply stops saying it was added by you. | Tout ce que vous avez ajouté à la bibliothèque — livres, exemplaires, auteurs, emplacements, historique de prêts — reste exactement en place. L’attribution « ajouté par vous » disparaît simplement. |
| TYPE_DELETE_TO_CONFIRM | Type "{word}" to confirm | Saisissez « {word} » pour confirmer |
| YOUR_ACCOUNT | Your account | Votre compte |
| SIGNED_IN_AS | Signed in as {code} | Connecté en tant que {code} |
| ADMINISTRATOR_LOWER | administrator | administrateur |
| PASSWORD | Password | Mot de passe |
| PASSWORD_DESC | Changing it signs out every other device. This one stays signed in. | Modifier ce mot de passe déconnecte tous les autres appareils. Celui-ci reste connecté. |
| SHOW_BOOKS | Show books | Afficher les livres |
| HIDE_BOOKS | Hide books | Masquer les livres |
| ENTITY_ADD | Add {noun} | Ajouter {noun} |
| ENTITY_EDIT | Edit {name} | Modifier {name} |
| ENTITY_DELETE_TITLE | Delete {name}? | Supprimer {name} ? |
| DELETE_LOCATION_DESCRIPTION | The copies shelved here keep existing; they just stop having a shelf. | Les exemplaires rangés ici sont conservés; ils n’ont simplement plus d’étagère. |
| DELETE_CATEGORY_DESCRIPTION | Books in this category keep existing; they become uncategorised. | Les livres de cette catégorie sont conservés; ils deviennent non catégorisés. |
| DELETE_ENTITY_DESCRIPTION | Books by this {noun} keep existing; they lose this {noun}. | Les livres associés à l’élément « {noun} » sont conservés; ils ne sont simplement plus associés à l’élément « {noun} ». |
| SAVE_BACKUP_CODES | Save your backup codes | Enregistrer vos codes de récupération |
| SAVE_BACKUP_CODES_DESC | Each code works once, if you lose your authenticator. They are shown now and never again. | Chaque code ne fonctionne qu’une fois si vous perdez l’accès à votre application d’authentification. Ils sont affichés maintenant et jamais plus. |
| COPY_ALL | Copy all | Tout copier |
| COPIED_BACKUP_CODES | Copied to the clipboard. Paste them somewhere safe now. | Copiés dans le presse-papiers. Collez-les maintenant dans un endroit sûr. |
| CLIPBOARD_BLOCKED_CODES | This browser refused clipboard access. Select the codes above and copy them by hand. | Ce navigateur a refusé l’accès au presse-papiers. Sélectionnez les codes ci-dessus et copiez-les manuellement. |
| I_SAVED_CODES | I have saved these codes | J’ai enregistré ces codes |
| SET_UP_2FA | Set up two-factor authentication | Configurer l’authentification à deux facteurs |
| SET_UP_2FA_DESC | Add the secret below to an authenticator app, then confirm the six-digit code it shows. | Ajoutez le secret ci-dessous à une application d’authentification, puis confirmez le code à six chiffres affiché. |
| VERIFYING | Verifying… | Vérification… |
| PREPARING_SECRET | Preparing a secret… | Préparation d’un secret… |
| SETUP_KEY | Setup key | Clé de configuration |
| COPY_KEY | Copy key | Copier la clé |
| COPIED | Copied. | Copié. |
| CLIPBOARD_BLOCKED_KEY | Clipboard blocked — select the key above instead. | Presse-papiers bloqué — sélectionnez plutôt la clé ci-dessus. |
| PHONE_2FA_HINT | Setting this up on the phone you are reading this on? Copy the key — the QR code is for scanning from a second device. | Vous configurez cette option sur le téléphone que vous utilisez pour lire ceci? Copiez la clé — le code QR sert à une numérisation depuis un deuxième appareil. |
| QR_CODE_ALT | QR code containing the same setup key | Code QR contenant la même clé de configuration |
| SIX_DIGIT_CODE | Six-digit code | Code à six chiffres |
| SIX_DIGIT_CODE_PLACEHOLDER | 123456 | 123456 |
| THEME_SYSTEM | System | Système |
| APPEARANCE | Appearance | Apparence |
| APPEARANCE_DESC | Applies to this browser right away, and to your next sign-in anywhere else. | S’applique immédiatement à ce navigateur et à votre prochaine ouverture de session ailleurs. |
| THIS_DEVICE | This device | Cet appareil |
| LOG_OUT_DEVICE | Log out {device} | Fermer la session {device} |
| ACTIVE_SESSIONS | Active sessions | Sessions actives |
| ACTIVE_SESSIONS_DESC | Every device currently signed in to this account. A session you do not recognise is worth ending. | Chaque appareil actuellement connecté à ce compte. Toute session que vous ne reconnaissez pas mérite d’être fermée. |
| LOADING_SESSIONS | Loading sessions… | Chargement des sessions… |
| SESSIONS_NOT_LOADED | Sessions did not load | Les sessions n’ont pas été chargées |
| SIGN_OUT_DEVICE | Sign out of this device? | Fermer la session sur cet appareil ? |
| LOG_OUT_THIS_DEVICE | Log out this device? | Fermer la session sur cet appareil ? |
| RETURN_TO_SIGN_IN | You will be taken back to the sign-in page. | Vous retournerez à la page de connexion. |
| SESSION_STOPS_NEXT_REQUEST | {device} stops working on its next request. | {device} cessera de fonctionner à sa prochaine requête. |
| LOGGING_OUT | Logging out… | Fermeture de session… |
| SIGNED_IN_FROM | Signed in {date} from {address}. | Connexion le {date} depuis {address}. |
| LEND_BOOKS | Lend books | Prêter des livres |
| LOADING_BORROWER_BOOKS | Loading what {name} has… | Chargement des livres de {name}… |
| BORROWER_BOOKS_NOT_LOADED | Those books did not load | Les livres de cet emprunteur n’ont pas été chargés. |
| NOTHING_OUT | Nothing out | Rien n’est prêté |
| BORROWER_BOOKS_EMPTY_DESC | {name} has no copies on loan. Lend one by entering the code printed on it. | {name} n’a aucun exemplaire prêté. Prêtez-en un en saisissant le code imprimé dessus. |
| BORROWERS | Borrowers | Emprunteurs |
| BORROWER_NAME_PLACEHOLDER | e.g. Camille Tremblay | p. ex. Camille Tremblay |
| GROUP_NAME_PLACEHOLDER | e.g. Class 4B | p. ex. Classe 4B |
| GROUP_DESCRIPTION_PLACEHOLDER | Optional — who belongs in this group | Facultatif — qui appartient à ce groupe |
| BORROWERS_OR_GROUPS | Borrowers or groups | Emprunteurs ou groupes |
| BORROWER_GROUPS | Borrower groups | Groupes d’emprunteurs |
| LOADING_GROUPS | Loading groups… | Chargement des groupes… |
| GROUPS_NOT_LOADED | The groups did not load | Les groupes n’ont pas été chargés |
| GROUPS_EMPTY | No groups yet | Aucun groupe pour l’instant |
| GROUPS_EMPTY_DESC | A group is an optional label — a class, a household, a department — that borrowers can be filed under. | Un groupe est une étiquette facultative — une classe, un ménage ou un service — sous laquelle les emprunteurs peuvent être classés. |
| SHOW_MEMBERS | Show members | Afficher les emprunteurs |
| HIDE_MEMBERS | Hide members | Masquer les emprunteurs |
| EMPTY | Empty | Vide |
| BORROWER_GROUP_MEMBERS | {count} borrower / {count} borrowers | {count} emprunteur / {count} emprunteurs |
| BORROWER | borrower | Emprunteur |
| ADD_BORROWER | Add borrower | Ajouter un emprunteur |
| LOADING_BORROWERS | Loading borrowers… | Chargement des emprunteurs… |
| BORROWERS_NOT_LOADED | The borrowers did not load | Les emprunteurs n’ont pas été chargés |
| BORROWERS_EMPTY | No borrowers yet | Aucun emprunteur pour l’instant |
| BORROWERS_EMPTY_DESC | A borrower is anyone a copy can go out to. There is no account behind one — it is a name the library tracks. | Un emprunteur est une personne à qui un exemplaire peut être prêté. Il ne s’agit pas d’un compte : la bibliothèque suit simplement son nom. |
| BORROWER_BOOKS_OUT | {count} book out / {count} books out | {count} livre prêté / {count} livres prêtés |
| GROUP_FOR | Group for {name} | Groupe pour {name} |
| GROUP_OPTIONAL_DESC | A group is optional — a borrower can belong to none. | Un groupe est facultatif — un emprunteur peut n’appartenir à aucun groupe. |
| MOVING | Moving… | Déplacement… |
| NO_GROUPS_YET | There are no groups yet. Add one on the Groups tab. | Il n’y a pas encore de groupes. Ajoutez-en un dans l’onglet Groupes. |
| UNKNOWN_DEVICE | Unknown device | Appareil inconnu |
| DEVICE_BROWSER_OS | {browser} · {os} | {browser} · {os} |
| UNKNOWN_ADDRESS | unknown address | Adresse inconnue |
| SIGNED_IN | Signed in | Connecté |
| FAILED_SIGN_IN | Failed sign-in attempt | Tentative de connexion échouée |
| SIGNED_OUT | Signed out | Déconnecté |
| PASSWORD_CHANGED | Password changed | Mot de passe modifié |
| LEND_TO | Lend to {name} | Prêter à {name} |
| LEND_COPIES_DESC | Enter the code printed on each copy. One per line. | Saisissez le code imprimé sur chaque exemplaire. Un par ligne. |
| LEND_COPIES | Lend {count} copy / Lend {count} copies | Prêter {count} exemplaire / Prêter {count} exemplaires |
| LEND_COPY | Lend copy | Prêter un exemplaire |
| COPY_CODE_PLACEHOLDER | e.g. 0000000001 | p. ex. 0000000001 |
| COPIES_WILL_GO_OUT | {length} copies will go out to {name}. | {length} exemplaires seront prêtés à {name}. |
| LOAN_REPORT | Loan report | Rapport de prêts |
| LOAN_REPORT_DESC | Every loan made in a date range, returned ones included. | Tous les prêts effectués pendant une période, y compris ceux qui ont été retournés. |
| GENERATING | Generating… | Génération… |
| GENERATE | Generate | Générer |
| ALL_BORROWERS | All borrowers | Tous les emprunteurs |
| LOAN_REPORT_DATES_REQUIRED | Both dates are required — the report is a bounded range, not the whole history. | Les deux dates sont obligatoires — le rapport couvre une période définie, et non tout l’historique. |
| NO_LOANS_IN_RANGE | No loans in that range. | Aucun prêt pendant cette période. |
| LOAN_REPORT_EMPTY_DESC | The history log only has rows for loans made through the app — a copy marked as lent directly in the database has no entry here. | L’historique ne contient que les prêts effectués dans l’application — un exemplaire marqué comme prêté directement dans la base de données n’y apparaît pas. |
| LOANS_COUNT | 1 loan / {count} loans | 1 prêt / {count} prêts |
| BACK_DATE | back {date} | retourné le {date} |
| STILL_OUT | still out | encore prêté |
| DOWNLOAD_CSV | Download CSV | Télécharger CSV |
| CSV_BOOK | Book | Livre |
| CSV_STOCK_CODE | Stock code | Code de l’exemplaire |
| CSV_BORROWER | Borrower | Emprunteur |
| CSV_GROUP | Group | Groupe |
| CSV_LENT_ON | Lent on | Prêté le |
| CSV_RETURNED_ON | Returned on | Retourné le |
| LENT_FROM | Lent from | Prêté depuis |
| LENT_TO_DATE | Lent to | Prêté à |
| REPORT | Report | Rapport |
| LOADING_LOANS | Loading loans… | Chargement des prêts… |
| LOANS_NOT_LOADED | The loans did not load | Les prêts n’ont pas été chargés |
| NOTHING_IS_OUT | Nothing is out | Rien n’est prêté |
| LOANS_EMPTY_DESC | Every copy is on its shelf. Lend one from a borrower's row on the Borrowers screen. | Chaque exemplaire est sur son étagère. Prêtez-en un à partir de la ligne d’un emprunteur à l’écran Emprunteurs. |
| GROUP_MEMBERS_EMPTY_DESC | Nobody is in {name} yet. Open a borrower's actions on the Borrowers tab and choose "Move to group". | Personne ne fait partie de {name} pour l’instant. Ouvrez les actions d’un emprunteur dans l’onglet Emprunteurs et choisissez « Déplacer vers un groupe ». |
| BORROWER_BOOKS | {count} book / {count} books | {count} livre / {count} livres |
| MOVE_SELECTED_TO | Move selected to | Déplacer la sélection vers |
| SELECT_BORROWER_TO_MOVE | Select someone to move | Sélectionnez une personne à déplacer |
| MOVE_COUNT | Move {length} | Déplacer {length} |
| LOCATION_NAME_PLACEHOLDER | e.g. Salon — bibliothèque murale | p. ex. Salon — bibliothèque murale |
| LOCATION_DESCRIPTION_PLACEHOLDER | Optional — where it is, what it holds | Facultatif — où il se trouve, ce qu’il contient |
| LOADING_LOCATIONS | Loading locations… | Chargement des emplacements… |
| LOCATIONS_NOT_LOADED | The locations did not load | Les emplacements n’ont pas été chargés |
| LOCATIONS_EMPTY | No locations yet | Aucun emplacement pour l’instant |
| LOCATIONS_EMPTY_DESC | A location is a shelf, a room, a box — wherever a copy physically lives. | Un emplacement peut être une étagère, une pièce ou une boîte — partout où un exemplaire est conservé physiquement. |
| LOCATION_COPIES | {count} copy / {count} copies | {count} exemplaire / {count} exemplaires |
| ADD_COPIES | Add copies | Ajouter des exemplaires |
| ADD_COPIES_TO | Add copies to {name} | Ajouter des exemplaires à {name} |
| ADD_COPIES_DESC | Enter the code printed on each copy. One per line. | Saisissez le code imprimé sur chaque exemplaire. Un par ligne. |
| MOVE_COPIES | Move {count} copy / Move {count} copies | Déplacer {count} exemplaire / Déplacer {count} exemplaires |
| MOVE_COPY | Move copy | Déplacer un exemplaire |
| COPIES_WILL_MOVE | {length} copies will be moved here. | {length} exemplaires seront déplacés ici. |
| DAMAGED | Damaged | Endommagé |
| STATUS_UNKNOWN | Status {status} | État {status} |
| LOADING_LOCATION_BOOKS | Loading what is on {name}… | Chargement des livres de {name}… |
| LOCATION_BOOKS_NOT_LOADED | Those books did not load | Les livres de cet emplacement n’ont pas été chargés |
| NOTHING_SHELVED | Nothing shelved here | Rien sur cette étagère |
| NOTHING_SHELVED_DESC | Move copies onto this shelf by entering the code printed on each one. | Déplacez les exemplaires sur cette étagère en saisissant le code imprimé sur chacun. |
| SCAN_ADDED | Added | Ajouté |
| UNDO | Undo | Annuler |
| SKIPPED | Skipped | Ignoré |
| UNDONE | Undone | Annulé |
| NOT_A_BOOK_BARCODE | Not a book barcode | Ce n’est pas le code-barres d’un livre |
| LOOKUP_SERVICE_UNAVAILABLE | Lookup service unavailable | Service de recherche indisponible |
| NOT_ADDED | Not added | Non ajouté |
| SKIPPED_ALREADY | Skipped — already in the library | Ignoré — déjà dans la bibliothèque |
| NO_METADATA_FOR_ISBN_SHORT | No metadata found for this ISBN | Aucune métadonnée trouvée pour cet ISBN |
| SCAN_SESSION | Scan session | Session de numérisation |
| NOTHING_ADDED_TO_LIBRARY | Nothing was added to the library. | Rien n’a été ajouté à la bibliothèque. |
| COPIES_ADDED_TO_LIBRARY | 1 copy added to the library. / {count} copies added to the library. | 1 exemplaire ajouté à la bibliothèque. / {count} exemplaires ajoutés à la bibliothèque. |
| NO_BOOKS_SCANNED | No books were scanned. | Aucun livre n’a été numérisé. |
| ALREADY_IN_LIBRARY_NOTHING_ADDED | Already in the library — nothing added. | Déjà dans la bibliothèque — aucun ajout. |
| NO_METADATA_FOUND | No metadata found for this ISBN. | Aucune métadonnée trouvée pour cet ISBN. |
| LOOKUP_RETRYING | Lookup service unavailable. Trying once more. | Service de recherche indisponible. Nouvelle tentative. |
| LOOKUP_UNAVAILABLE_NOT_ADDED | The lookup service is unavailable. Not added. | Le service de recherche est indisponible. Aucun ajout effectué. |
| SCAN_COULD_NOT_BE_ADDED | Could not be added. Try scanning it again. | Impossible d’ajouter ce livre. Numérisez-le de nouveau. |
| NOT_A_BOOK_BARCODE_DESC | That is not a book barcode. Look for the ISBN one. | Ce n’est pas un code-barres de livre. Cherchez plutôt celui de l’ISBN. |
| REMOVED_FROM_LIBRARY | Removed from the library. | Retiré de la bibliothèque. |
| COPY_REMOVED | That copy was removed. | Cet exemplaire a été retiré. |
| COULD_NOT_BE_UNDONE | Could not be undone. | Impossible d’annuler cette action. |
| DUPLICATE_CHECK_UNAVAILABLE | The library could not be checked just now, so this book may or may not already be recorded. | La bibliothèque n’a pas pu être vérifiée pour l’instant; ce livre est peut-être déjà enregistré. |
| ONE_COPY_RECORDED | One copy is already recorded. | Un exemplaire est déjà enregistré. |
| COPIES_RECORDED | 1 copy is already recorded. / {count} copies are already recorded. | 1 exemplaire est déjà enregistré. / {count} exemplaires sont déjà enregistrés. |
| ALREADY_IN_LIBRARY | Already in the library | Déjà dans la bibliothèque |
| SCANNING_PAUSED_DUPLICATE | Scanning is paused until you answer. Nothing has been added yet. | La numérisation est en pause jusqu’à votre réponse. Rien n’a encore été ajouté. |
| ADD_ANOTHER_COPY | Add another copy | Ajouter un autre exemplaire |
| SKIP | Skip | Ignorer |
| THIS_ISBN | This ISBN | Ce ISBN |
| SHELVED_AT | Shelved at {shelves}. | Déposé à {shelves}. |
| SCAN_ADDED_COUNT | 1 added / {count} added | 1 ajouté / {count} ajoutés |
| SCAN_PENDING_COUNT |  · {pendingCount} pending |  · {pendingCount} en attente |
| SCANNING_PAUSED | Scanning paused | Numérisation en pause |
| POINT_CAMERA_BARCODE | Point the camera at the barcode | Pointez la caméra vers le code-barres |
| STARTING_CAMERA | Starting the camera… | Démarrage de la caméra… |
| TORCH | Torch | Lampe |
| SHELVING_AT_CHANGE | Shelving at {location}. Change. | Rangement à {location}. Modifier. |
| SHELF_CHOICE | Shelf: {location} | Emplacement : {location} |
| CAMERA_NOT_AVAILABLE | The camera is not available | La caméra n’est pas disponible |
| CAMERA_COULD_NOT_START | The camera could not be started. | La caméra n’a pas pu démarrer. Ajoutez plutôt l’ISBN manuellement. |
| TYPE_ISBN_INSTEAD | Type an ISBN instead | Saisir plutôt un ISBN |
| WHERE_COPIES_GO | Where do these copies go? | Où vont ces exemplaires ? |
| SCAN_LOCATION_DESC | Asked once so scanning is not interrupted. You can change it between books. | Demandé une seule fois pour ne pas interrompre la numérisation. Vous pouvez le modifier entre deux livres. |
| LEAVE_SCAN_MODE | Leave scan mode | Quitter le mode numérisation |
| METADATA_FIELD_NAME | Title | Titre |
| METADATA_FIELD_DESCRIPTION | Description | Description |
| METADATA_FIELD_IMAGE_URL | Cover | Couverture |
| METADATA_FIELD_CATEGORY | Category | Catégorie |
| METADATA_FIELD_PUBLISHER | Publisher | Éditeur |
| METADATA_FIELD_PUBLISHED_DATE | Publication date | Date de publication |
| METADATA_FIELD_PAGES | Pages | Pages |
| METADATA_FIELD_LANGUAGE | Language | Langue |
| METADATA_FIELD_AUTHORS | Authors | Auteurs |
| LANGUAGE_OPTION_EN | English | Anglais |
| LANGUAGE_OPTION_FR | French | Français |
| LANGUAGE_OPTION_ES | Spanish | Espagnol |
| LANGUAGE_OPTION_CA | Catalan | Catalan |
| LANGUAGE_OPTION_IT | Italian | Italien |
| REGION_AU | Australia | Australie |
| REGION_BR | Brazil | Brésil |
| REGION_CA | Canada | Canada |
| REGION_CN | China | Chine |
| REGION_FR | France | France |
| REGION_DE | Germany | Allemagne |
| REGION_IT | Italy | Italie |
| REGION_JP | Japan | Japon |
| REGION_MX | Mexico | Mexique |
| REGION_PT | Portugal | Portugal |
| REGION_RU | Russia | Russie |
| REGION_SA | Saudi Arabia | Arabie saoudite |
| REGION_ES | Spain | Espagne |
| REGION_TW | Taiwan | Taïwan |
| REGION_GB | United Kingdom | Royaume-Uni |
| REGION_US | United States | États-Unis |
| LOAN_COPIES_OUT | 1 copy out / {count} copies out | 1 exemplaire prêté / {count} exemplaires prêtés |
| TREND_BOOKS | 1 book / {count} books | 1 livre / {count} livres |
| METADATA_SOURCES_NOT_CONFIGURED | Configuration missing on this server for: {sources}. | Configuration manquante sur ce serveur pour : {sources}. |
| UNSPECIFIED_METADATA_SOURCE | a metadata source | une source de métadonnées |
| METADATA_SOURCE_UNAVAILABLE | Metadata source unavailable | Source de métadonnées indisponible |
| NO_METADATA_FOR_ISBN_TITLE | No metadata for this ISBN | Aucune métadonnée pour cet ISBN |
| ADMIN_METADATA_OK | No new metadata found. | Aucune nouvelle métadonnée trouvée. |
| ADMIN_METADATA_NO_ISBN | Add a valid ISBN in the book details, then retry. | Ajoutez un ISBN valide dans les détails du livre, puis réessayez. |
| ADMIN_METADATA_NO_METADATA | No metadata returned. Check the ISBN or try again later. | Aucune métadonnée reçue. Vérifiez l’ISBN ou réessayez plus tard. |
| ADMIN_METADATA_NOT_FOUND | Book no longer exists. Remove it from your selection. | Le livre n’existe plus. Retirez-le de votre sélection. |
| ADMIN_METADATA_ERROR | Refresh failed. Try this book again. | Actualisation échouée. Réessayez pour ce livre. |
| ADMIN_METADATA_ISBN_CHANGED | The ISBN changed during the lookup. Try this book again. | L’ISBN a changé pendant la recherche. Réessayez pour ce livre. |
| SCAN_COPY_ADDED | Copy {count} added | Exemplaire {count} ajouté |
| SCAN_2_COPY_ADDED | scan 2 copy added | 2e exemplaire ajouté |
| SCAN_3_COPY_ADDED | scan 3 copy added | 3e exemplaire ajouté |
| SCAN_4_COPY_ADDED | scan 4 copy added | 4e exemplaire ajouté |
| SCAN_5_COPY_ADDED | scan 5 copy added | 5e exemplaire ajouté |
| SCAN_6_COPY_ADDED | scan 6 copy added | 6e exemplaire ajouté |
| SCAN_7_COPY_ADDED | scan 7 copy added | 7e exemplaire ajouté |
| SCAN_8_COPY_ADDED | scan 8 copy added | 8e exemplaire ajouté |
| SCAN_9_COPY_ADDED | scan 9 copy added | 9e exemplaire ajouté |
| SCAN_10_COPY_ADDED | scan 10 copy added | 10e exemplaire ajouté |
| ACCOUNT_COUNT.one | {count} account | {count} compte |
| ACCOUNT_COUNT.other | {count} accounts | {count} comptes |
| ADD_PENDING.one | Add {count} | Ajouter {count} |
| ADD_PENDING.other | Add {count} | Ajouter {count} |
| BORROWER_BOOKS.one | {count} book | {count} livre |
| BORROWER_BOOKS.other | {count} books | {count} livres |
| BORROWER_BOOKS_OUT.one | {count} book out | {count} livre prêté |
| BORROWER_BOOKS_OUT.other | {count} books out | {count} livres prêtés |
| BORROWER_GROUP_MEMBERS.one | {count} borrower | {count} emprunteur |
| BORROWER_GROUP_MEMBERS.other | {count} borrowers | {count} emprunteurs |
| COPIES.one | copy | exemplaire |
| COPIES.other | copies | exemplaires |
| COPIES_ADDED_TO_LIBRARY.one | 1 copy added to the library. | 1 exemplaire ajouté à la bibliothèque. |
| COPIES_ADDED_TO_LIBRARY.other | {count} copies added to the library. | {count} exemplaires ajoutés à la bibliothèque. |
| COPIES_RECORDED.one | 1 copy is already recorded. | Un exemplaire est déjà enregistré. |
| COPIES_RECORDED.other | {count} copies are already recorded. | {count} exemplaires sont déjà enregistrés. |
| DASHBOARD_COUNTER_LIBRARY.one | {count} in the library | {count} dans la bibliothèque |
| DASHBOARD_COUNTER_LIBRARY.other | {count} in the library | {count} dans la bibliothèque |
| DASHBOARD_COUNTER_NO_COPIES.one | {count} with no copies | {count} sans exemplaire |
| DASHBOARD_COUNTER_NO_COPIES.other | {count} with no copies | {count} sans exemplaire |
| DASHBOARD_COUNTER_OUT.one | {count} out | {count} prêté |
| DASHBOARD_COUNTER_OUT.other | {count} out | {count} prêtés |
| DASHBOARD_COUNTER_RECENT.one | {count} added in the last 30 days | {count} ajouté au cours des 30 derniers jours |
| DASHBOARD_COUNTER_RECENT.other | {count} added in the last 30 days | {count} ajoutés au cours des 30 derniers jours |
| LEND_COPIES.one | Lend {count} copy | Prêter {count} exemplaire |
| LEND_COPIES.other | Lend {count} copies | Prêter {count} exemplaires |
| LOANS_COUNT.one | 1 loan | 1 prêt |
| LOANS_COUNT.other | {count} loans | {count} prêts |
| LOCATION_COPIES.one | {count} copy | {count} exemplaire |
| LOCATION_COPIES.other | {count} copies | {count} exemplaires |
| LOAN_COPIES_OUT.one | 1 copy out | 1 exemplaire prêté |
| LOAN_COPIES_OUT.other | {count} copies out | {count} exemplaires prêtés |
| MOVE_COPIES.one | Move {count} copy | Déplacer {count} exemplaire |
| MOVE_COPIES.other | Move {count} copies | Déplacer {count} exemplaires |
| REFRESHING_BOOKS.one | Refreshing {count} book… | Actualisation de {count} livre… |
| REFRESHING_BOOKS.other | Refreshing {count} books… | Actualisation de {count} livres… |
| REFRESH_SELECTED_BOOKS.one | Refresh {count} selected book | Actualiser {count} livre sélectionné |
| REFRESH_SELECTED_BOOKS.other | Refresh {count} selected books | Actualiser {count} livres sélectionnés |
| RETURN_COPIES_COUNT.one | Return {count} copy | Retourner {count} exemplaire |
| RETURN_COPIES_COUNT.other | Return {count} copies | Retourner {count} exemplaires |
| SCAN_ADDED_COUNT.one | 1 added | 1 ajouté |
| SCAN_ADDED_COUNT.other | {count} added | {count} ajoutés |
| SEARCH_MATCHES.one | 1 book matches | 1 livre correspond |
| SEARCH_MATCHES.other | {count} books match | {count} livres correspondent |
| SEARCH_TOTAL.one | 1 book | 1 livre |
| SEARCH_TOTAL.other | {count} books | {count} livres |
| TREND_BOOKS.one | 1 book | 1 livre |
| TREND_BOOKS.other | {count} books | {count} livres |
| TREND_BOOKS_ADDED.one | {count} book added | {count} livre ajouté |
| TREND_BOOKS_ADDED.other | {count} books added | {count} livres ajoutés |
| APP_START_ERROR_TITLE | The app failed to start | Échec du démarrage de l’application |
| NOT_FOUND_TITLE | Not found | Page introuvable |
| UNKNOWN_ERROR | Something went wrong. | Une erreur est survenue. |
| NO_CAMERA_API | This browser has no camera API. Add the ISBN by hand instead. | Ce navigateur ne fournit aucune API de caméra. Saisissez plutôt l’ISBN manuellement. |
| CAMERA_NEEDS_HTTPS | The camera needs a secure (https) connection. Open the library over https and try again. | La caméra exige une connexion sécurisée (https). Ouvrez la bibliothèque en https, puis réessayez. |
| CAMERA_ACCESS_REFUSED | Camera access was refused. Add the ISBN by hand instead, or allow the camera in your browser settings and reopen Scan. | L’accès à la caméra a été refusé. Saisissez plutôt l’ISBN manuellement ou autorisez la caméra dans les réglages du navigateur, puis rouvrez Numériser. |
| NO_CAMERA_ANSWERED | No camera answered. Add the ISBN by hand instead. | Aucune caméra n’a répondu. Saisissez plutôt l’ISBN manuellement. |
| BARCODE_READER_UNSUPPORTED | This browser cannot read barcodes. Add the ISBN by hand instead. | Ce navigateur ne peut pas lire les codes-barres. Saisissez plutôt l’ISBN manuellement. |
| BARCODE_READER_FAILED | The barcode reader could not start. Add the ISBN by hand instead. | Le lecteur de codes-barres n’a pas pu démarrer. Saisissez plutôt l’ISBN manuellement. |
