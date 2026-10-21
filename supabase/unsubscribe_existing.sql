-- Όσοι ζήτησαν διαγραφή με το ΠΑΛΙΟ σύστημα (email «Unsubscribe Washio» στο withinsuccess@gmail.com,
-- έως 21/10/2026). Τους σημειώνουμε ως διαγραμμένους → εξαιρούνται από καμπάνιες, «−3€ σε περιμένει»
-- και «−3€ λήγει σήμερα» (ίδιο σημάδι με το νέο one-click: app_metadata.email_opt_out).
-- Ασφαλές να ξανατρέξει. Τα emails κρατήσεων (επιβεβαίωση/υπενθύμιση) ΔΕΝ επηρεάζονται.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('email_opt_out', true, 'email_opt_out_at', now()::text, 'email_opt_out_src', 'mailto_legacy')
where lower(email) in (
  'dimitristsvls@gmail.com','fanisbar123@gmail.com','maria_gantx@hotmail.com','marhsjim@gmail.com',
  'bileros91@gmail.com','s.nikolakopoulou32@gmail.com','gikokkalis@gmail.com','eezacharioudaki@gmail.com',
  'zkiamos@gmail.com','abalatsour@yahoo.gr','panosmag2@gmail.com','depetros23@gmail.com',
  'androutsosalexandros13@hotmail.com','antongalanisph@gmail.com','valkanisk7@gmail.com',
  'martgiorgos2@hotmail.com','nikosdavis143@gmail.com','themi19931993@gmail.com','basicdomus@gmail.com'
);

-- Έλεγχος (πρέπει να βγει 18 — το martgiorgos2@hotmail.com δεν υπάρχει ως λογαριασμός):
select count(*) as opted_out from auth.users where raw_app_meta_data->>'email_opt_out' = 'true';
