-- Crown Car Wash (Άλιμος): ο συνεργάτης μπαίνει με agondal4312@gmail.com,
-- αλλά το πλυντήριο είναι δεμένο στο arshadmoh26@gmail.com (που δεν έχει κάνει ποτέ login).
-- Το σύστημα δέχεται ΕΝΑΝ λογαριασμό ανά πλυντήριο → περνάμε το Crown στο agondal.
-- Ο λογαριασμός arshad μένει ως έχει (δεν σβήνεται), απλά δεν βλέπει πια το dashboard.

update public.locations
set owner_id = (select id from auth.users where lower(email) = 'agondal4312@gmail.com')
where id = 'c6159641-8626-44eb-8006-f1d877739473'
  and exists (select 1 from auth.users where lower(email) = 'agondal4312@gmail.com');

-- Έλεγχος: πρέπει να δείξει owner_email = agondal4312@gmail.com
select l.name, l.is_active, u.email as owner_email
from public.locations l
left join auth.users u on u.id = l.owner_id
where l.id = 'c6159641-8626-44eb-8006-f1d877739473';
