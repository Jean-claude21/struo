-- Review of every role (2026-11-21).
-- 1. A required « Contract » document was filed as administrative, so the site overview said « no
--    contract » while compliance said « contract in order »: contracts, quotes and signed change
--    orders belong to the « Contract and quote » family.
-- 2. Sites created after spec 048 had their required documents filed as « other », shown with the
--    drawings: administrative papers go back to « administrative ».
update project_document d set family = case
         when t.name ~* '(contrat|devis|march[ée]|avenant|contract|quote|agreement)' then 'contract'
         when t.name ~* '(plan|coupe|fa[cç]ade|[ée]tude|note de calcul|ferraill|drawing|section)' then 'technical'
         else 'admin' end
  from doc_type t
 where t.id = d.doc_type_id and d.family in ('admin', 'other');
update project_document set family = 'contract'
 where family in ('admin', 'other') and doc_type_id is null
   and title ~* '(contrat|devis|march[ée] sign|avenant sign|contract|quote)';
