-- ============================================================================
-- PostgreSQL Data Insert Script for HR Schema
-- Generated from Oracle HR Schema Data
-- Date: 2025-12-11
-- Total Records: 218 rows across 7 tables
-- ============================================================================

-- Disable triggers temporarily for faster inserts
SET search_path TO hr;
SET session_replication_role = 'replica';

-- ============================================================================
-- Table: REGIONS (5 rows)
-- ============================================================================
INSERT INTO regions (region_id, region_name) VALUES
(10, 'Europe'),
(20, 'Americas'),
(30, 'Asia'),
(40, 'Oceania'),
(50, 'Africa');

-- ============================================================================
-- Table: COUNTRIES (25 rows)
-- ============================================================================
INSERT INTO countries (country_id, country_name, region_id) VALUES
('AR', 'Argentina', 20),
('AU', 'Australia', 40),
('BE', 'Belgium', 10),
('BR', 'Brazil', 20),
('CA', 'Canada', 20),
('CH', 'Switzerland', 10),
('CN', 'China', 30),
('DE', 'Germany', 10),
('DK', 'Denmark', 10),
('EG', 'Egypt', 50),
('FR', 'France', 10),
('GB', 'United Kingdom of Great Britain and Northern Ireland', 10),
('IL', 'Israel', 30),
('IN', 'India', 30),
('IT', 'Italy', 10),
('JP', 'Japan', 30),
('KW', 'Kuwait', 30),
('ML', 'Malaysia', 30),
('MX', 'Mexico', 20),
('NG', 'Nigeria', 50),
('NL', 'Netherlands', 10),
('SG', 'Singapore', 30),
('US', 'United States of America', 20),
('ZM', 'Zambia', 50),
('ZW', 'Zimbabwe', 50);

-- ============================================================================
-- Table: LOCATIONS (23 rows)
-- ============================================================================
INSERT INTO locations (location_id, street_address, postal_code, city, state_province, country_id) VALUES
(1000, '1297 Via Cola di Rie', '00989', 'Roma', NULL, 'IT'),
(1100, '93091 Calle della Testa', '10934', 'Venice', NULL, 'IT'),
(1200, '2017 Shinjuku-ku', '1689', 'Tokyo', 'Tokyo Prefecture', 'JP'),
(1300, '9450 Kamiya-cho', '6823', 'Hiroshima', NULL, 'JP'),
(1400, '2014 Jabberwocky Rd', '26192', 'Southlake', 'Texas', 'US'),
(1500, '2011 Interiors Blvd', '99236', 'South San Francisco', 'California', 'US'),
(1600, '2007 Zagora St', '50090', 'South Brunswick', 'New Jersey', 'US'),
(1700, '2004 Charade Rd', '98199', 'Seattle', 'Washington', 'US'),
(1800, '147 Spadina Ave', 'M5V 2L7', 'Toronto', 'Ontario', 'CA'),
(1900, '6092 Boxwood St', 'YSW 9T2', 'Whitehorse', 'Yukon', 'CA'),
(2000, '40-5-12 Laogianggen', '190518', 'Beijing', NULL, 'CN'),
(2100, '1298 Vileparle (E)', '490231', 'Bombay', 'Maharashtra', 'IN'),
(2200, '12-98 Victoria Street', '2901', 'Sydney', 'New South Wales', 'AU'),
(2300, '198 Clementi North', '540198', 'Singapore', NULL, 'SG'),
(2400, '8204 Arthur St', NULL, 'London', NULL, 'GB'),
(2500, 'Magdalen Centre, The Oxford Science Park', 'OX9 9ZB', 'Oxford', 'Oxford', 'GB'),
(2600, '9702 Chester Road', '09629850293', 'Stretford', 'Manchester', 'GB'),
(2700, 'Schwanthalerstr. 7031', '80925', 'Munich', 'Bavaria', 'DE'),
(2800, 'Rua Frei Caneca 1360 ', '01307-002', 'Sao Paulo', 'Sao Paulo', 'BR'),
(2900, '20 Rue des Corps-Saints', '1730', 'Geneva', 'Geneve', 'CH'),
(3000, 'Murtenstrasse 921', '3095', 'Bern', 'BE', 'CH'),
(3100, 'Pieter Breughelstraat 837', '3029SK', 'Utrecht', 'Utrecht', 'NL'),
(3200, 'Mariano Escobedo 9991', '11932', 'Mexico City', 'Distrito Federal', 'MX');

-- ============================================================================
-- Table: JOBS (19 rows)
-- ============================================================================
INSERT INTO jobs (job_id, job_title, min_salary, max_salary) VALUES
('AC_ACCOUNT', 'Public Accountant', 4200, 9000),
('AC_MGR', 'Accounting Manager', 8200, 16000),
('AD_ASST', 'Administration Assistant', 3000, 6000),
('AD_PRES', 'President', 20080, 40000),
('AD_VP', 'Administration Vice President', 15000, 30000),
('FI_ACCOUNT', 'Accountant', 4200, 9000),
('FI_MGR', 'Finance Manager', 8200, 16000),
('HR_REP', 'Human Resources Representative', 4000, 9000),
('IT_PROG', 'Programmer', 4000, 10000),
('MK_MAN', 'Marketing Manager', 9000, 15000),
('MK_REP', 'Marketing Representative', 4000, 9000),
('PR_REP', 'Public Relations Representative', 4500, 10500),
('PU_CLERK', 'Purchasing Clerk', 2500, 5500),
('PU_MAN', 'Purchasing Manager', 8000, 15000),
('SA_MAN', 'Sales Manager', 10000, 20080),
('SA_REP', 'Sales Representative', 6000, 12008),
('SH_CLERK', 'Shipping Clerk', 2500, 5500),
('ST_CLERK', 'Stock Clerk', 2008, 5000),
('ST_MAN', 'Stock Manager', 5500, 8500);

-- ============================================================================
-- Table: DEPARTMENTS (27 rows)
-- Note: manager_id will be updated after employees are inserted
-- ============================================================================
INSERT INTO departments (department_id, department_name, manager_id, location_id) VALUES
(10, 'Administration', NULL, 1700),
(20, 'Marketing', NULL, 1800),
(30, 'Purchasing', NULL, 1700),
(40, 'Human Resources', NULL, 2400),
(50, 'Shipping', NULL, 1500),
(60, 'IT', NULL, 1400),
(70, 'Public Relations', NULL, 2700),
(80, 'Sales', NULL, 2500),
(90, 'Executive', NULL, 1700),
(100, 'Finance', NULL, 1700),
(110, 'Accounting', NULL, 1700),
(120, 'Treasury', NULL, 1700),
(130, 'Corporate Tax', NULL, 1700),
(140, 'Control And Credit', NULL, 1700),
(150, 'Shareholder Services', NULL, 1700),
(160, 'Benefits', NULL, 1700),
(170, 'Manufacturing', NULL, 1700),
(180, 'Construction', NULL, 1700),
(190, 'Contracting', NULL, 1700),
(200, 'Operations', NULL, 1700),
(210, 'IT Support', NULL, 1700),
(220, 'NOC', NULL, 1700),
(230, 'IT Helpdesk', NULL, 1700),
(240, 'Government Sales', NULL, 1700),
(250, 'Retail Sales', NULL, 1700),
(260, 'Recruiting', NULL, 1700),
(270, 'Payroll', NULL, 1700);

-- ============================================================================
-- Table: EMPLOYEES (107 rows)
-- ============================================================================
INSERT INTO employees (employee_id, first_name, last_name, email, phone_number, hire_date, job_id, salary, commission_pct, manager_id, department_id) VALUES
(100, 'Steven', 'King', 'SKING', '1.515.555.0100', '2013-06-17', 'AD_PRES', 24000.00, NULL, NULL, 90),
(101, 'Neena', 'Yang', 'NYANG', '1.515.555.0101', '2015-09-21', 'AD_VP', 17000.00, NULL, 100, 90),
(102, 'Lex', 'Garcia', 'LGARCIA', '1.515.555.0102', '2011-01-13', 'AD_VP', 17000.00, NULL, 100, 90),
(103, 'Alexander', 'James', 'AJAMES', '1.590.555.0103', '2016-01-03', 'IT_PROG', 9000.00, NULL, 102, 60),
(104, 'Bruce', 'Miller', 'BMILLER', '1.590.555.0104', '2017-05-21', 'IT_PROG', 6000.00, NULL, 103, 60),
(105, 'David', 'Williams', 'DWILLIAMS', '1.590.555.0105', '2015-06-25', 'IT_PROG', 4800.00, NULL, 103, 60),
(106, 'Valli', 'Jackson', 'VJACKSON', '1.590.555.0106', '2016-02-05', 'IT_PROG', 4800.00, NULL, 103, 60),
(107, 'Diana', 'Nguyen', 'DNGUYEN', '1.590.555.0107', '2017-02-07', 'IT_PROG', 4200.00, NULL, 103, 60),
(108, 'Nancy', 'Gruenberg', 'NGRUENBE', '1.515.555.0108', '2012-08-17', 'FI_MGR', 12008.00, NULL, 101, 100),
(109, 'Daniel', 'Faviet', 'DFAVIET', '1.515.555.0109', '2012-08-16', 'FI_ACCOUNT', 9000.00, NULL, 108, 100),
(110, 'John', 'Chen', 'JCHEN', '1.515.555.0110', '2015-09-28', 'FI_ACCOUNT', 8200.00, NULL, 108, 100),
(111, 'Ismael', 'Sciarra', 'ISCIARRA', '1.515.555.0111', '2015-09-30', 'FI_ACCOUNT', 7700.00, NULL, 108, 100),
(112, 'Jose Manuel', 'Urman', 'JMURMAN', '1.515.555.0112', '2016-03-07', 'FI_ACCOUNT', 7800.00, NULL, 108, 100),
(113, 'Luis', 'Popp', 'LPOPP', '1.515.555.0113', '2017-12-07', 'FI_ACCOUNT', 6900.00, NULL, 108, 100),
(114, 'Den', 'Li', 'DLI', '1.515.555.0114', '2012-12-07', 'PU_MAN', 11000.00, NULL, 100, 30),
(115, 'Alexander', 'Khoo', 'AKHOO', '1.515.555.0115', '2013-05-18', 'PU_CLERK', 3100.00, NULL, 114, 30),
(116, 'Shelli', 'Baida', 'SBAIDA', '1.515.555.0116', '2015-12-24', 'PU_CLERK', 2900.00, NULL, 114, 30),
(117, 'Sigal', 'Tobias', 'STOBIAS', '1.515.555.0117', '2015-07-24', 'PU_CLERK', 2800.00, NULL, 114, 30),
(118, 'Guy', 'Himuro', 'GHIMURO', '1.515.555.0118', '2016-11-15', 'PU_CLERK', 2600.00, NULL, 114, 30),
(119, 'Karen', 'Colmenares', 'KCOLMENA', '1.515.555.0119', '2017-08-10', 'PU_CLERK', 2500.00, NULL, 114, 30),
(120, 'Matthew', 'Weiss', 'MWEISS', '1.650.555.0120', '2014-07-18', 'ST_MAN', 8000.00, NULL, 100, 50),
(121, 'Adam', 'Fripp', 'AFRIPP', '1.650.555.0121', '2015-04-10', 'ST_MAN', 8200.00, NULL, 100, 50),
(122, 'Payam', 'Kaufling', 'PKAUFLIN', '1.650.555.0122', '2013-05-01', 'ST_MAN', 7900.00, NULL, 100, 50),
(123, 'Shanta', 'Vollman', 'SVOLLMAN', '1.650.555.0123', '2015-10-10', 'ST_MAN', 6500.00, NULL, 100, 50),
(124, 'Kevin', 'Mourgos', 'KMOURGOS', '1.650.555.0124', '2017-11-16', 'ST_MAN', 5800.00, NULL, 100, 50),
(125, 'Julia', 'Nayer', 'JNAYER', '1.650.555.0125', '2015-03-16', 'ST_CLERK', 3200.00, NULL, 120, 50),
(126, 'Irene', 'Mikkilineni', 'IMIKKILI', '1.650.555.0126', '2016-09-28', 'ST_CLERK', 2700.00, NULL, 120, 50),
(127, 'James', 'Landry', 'JLANDRY', '1.650.555.0127', '2017-01-14', 'ST_CLERK', 2400.00, NULL, 120, 50),
(128, 'Steven', 'Markle', 'SMARKLE', '1.650.555.0128', '2018-03-08', 'ST_CLERK', 2200.00, NULL, 120, 50),
(129, 'Laura', 'Bissot', 'LBISSOT', '1.650.555.0129', '2015-08-20', 'ST_CLERK', 3300.00, NULL, 121, 50),
(130, 'Mozhe', 'Atkinson', 'MATKINSO', '1.650.555.0130', '2015-10-30', 'ST_CLERK', 2800.00, NULL, 121, 50),
(131, 'James', 'Marlow', 'JAMRLOW', '1.650.555.0131', '2015-02-16', 'ST_CLERK', 2500.00, NULL, 121, 50),
(132, 'TJ', 'Olson', 'TJOLSON', '1.650.555.0132', '2017-04-10', 'ST_CLERK', 2100.00, NULL, 121, 50),
(133, 'Jason', 'Mallin', 'JMALLIN', '1.650.555.0133', '2014-06-14', 'ST_CLERK', 3300.00, NULL, 122, 50),
(134, 'Michael', 'Rogers', 'MROGERS', '1.650.555.0134', '2016-08-26', 'ST_CLERK', 2900.00, NULL, 122, 50),
(135, 'Ki', 'Gee', 'KGEE', '1.650.555.0135', '2017-12-12', 'ST_CLERK', 2400.00, NULL, 122, 50),
(136, 'Hazel', 'Philtanker', 'HPHILTAN', '1.650.555.0136', '2018-02-06', 'ST_CLERK', 2200.00, NULL, 122, 50),
(137, 'Renske', 'Ladwig', 'RLADWIG', '1.650.555.0137', '2013-07-14', 'ST_CLERK', 3600.00, NULL, 123, 50),
(138, 'Stephen', 'Stiles', 'SSTILES', '1.650.555.0138', '2015-10-26', 'ST_CLERK', 3200.00, NULL, 123, 50),
(139, 'John', 'Seo', 'JSEO', '1.650.555.0139', '2016-02-12', 'ST_CLERK', 2700.00, NULL, 123, 50),
(140, 'Joshua', 'Patel', 'JPATEL', '1.650.555.0140', '2016-04-06', 'ST_CLERK', 2500.00, NULL, 123, 50),
(141, 'Trenna', 'Rajs', 'TRAJS', '1.650.555.0141', '2013-10-17', 'ST_CLERK', 3500.00, NULL, 124, 50),
(142, 'Curtis', 'Davies', 'CDAVIES', '1.650.555.0142', '2015-01-29', 'ST_CLERK', 3100.00, NULL, 124, 50),
(143, 'Randall', 'Matos', 'RMATOS', '1.650.555.0143', '2016-03-15', 'ST_CLERK', 2600.00, NULL, 124, 50),
(144, 'Peter', 'Vargas', 'PVARGAS', '1.650.555.0144', '2016-07-09', 'ST_CLERK', 2500.00, NULL, 124, 50),
(145, 'John', 'Russell', 'JRUSSEL', '1.011.555.0145', '2014-10-01', 'SA_MAN', 14000.00, 0.40, 100, 80),
(146, 'Karen', 'Partners', 'KPARTNER', '1.011.555.0146', '2015-01-05', 'SA_MAN', 13500.00, 0.30, 100, 80),
(147, 'Alberto', 'Errazuriz', 'AERRAZUR', '1.011.555.0147', '2015-03-10', 'SA_MAN', 12000.00, 0.30, 100, 80),
(148, 'Gerald', 'Cambrault', 'GCAMBRAU', '1.011.555.0148', '2017-10-15', 'SA_MAN', 11000.00, 0.30, 100, 80),
(149, 'Eleni', 'Zlotkey', 'EZLOTKEY', '1.011.555.0149', '2018-01-29', 'SA_MAN', 10500.00, 0.20, 100, 80),
(150, 'Peter', 'Tucker', 'PTUCKER', '1.011.555.0145', '2015-01-30', 'SA_REP', 10000.00, 0.30, 145, 80),
(151, 'David', 'Bernstein', 'DBERNSTE', '1.011.555.0146', '2015-03-24', 'SA_REP', 9500.00, 0.25, 145, 80),
(152, 'Peter', 'Hall', 'PHALL', '1.011.555.0147', '2015-08-20', 'SA_REP', 9000.00, 0.25, 145, 80),
(153, 'Christopher', 'Olsen', 'COLSEN', '1.011.555.0148', '2016-03-30', 'SA_REP', 8000.00, 0.20, 145, 80),
(154, 'Nanette', 'Cambrault', 'NCAMBRAU', '1.011.555.0149', '2016-12-09', 'SA_REP', 7500.00, 0.20, 145, 80),
(155, 'Oliver', 'Tuvault', 'OTUVAULT', '1.011.555.0150', '2017-11-23', 'SA_REP', 7000.00, 0.15, 145, 80),
(156, 'Janette', 'Smith', 'JSMITH', '1.011.555.0146', '2016-02-10', 'SA_REP', 10000.00, 0.35, 146, 80),
(157, 'Patrick', 'Sully', 'PSULLY', '1.011.555.0146', '2016-03-04', 'SA_REP', 9500.00, 0.35, 146, 80),
(158, 'Allan', 'McEwen', 'AMCEWEN', '1.011.555.0147', '2016-08-01', 'SA_REP', 9000.00, 0.35, 146, 80),
(159, 'Lindsey', 'Johnson', 'LJOHNSON', '1.011.555.0148', '2017-03-10', 'SA_REP', 8000.00, 0.30, 146, 80),
(160, 'Louise', 'Doran', 'LDORAN', '1.011.555.0149', '2017-12-15', 'SA_REP', 7500.00, 0.30, 146, 80),
(161, 'Sarath', 'Sewall', 'SSEWALL', '1.011.555.0150', '2016-11-03', 'SA_REP', 7000.00, 0.25, 146, 80),
(162, 'Clara', 'Vishney', 'CVISHNEY', '1.011.555.0147', '2015-11-11', 'SA_REP', 10500.00, 0.25, 147, 80),
(163, 'Danielle', 'Greene', 'DGREENE', '1.011.555.0148', '2017-03-19', 'SA_REP', 9500.00, 0.15, 147, 80),
(164, 'Mattea', 'Marvins', 'MMARVINS', '1.011.555.0149', '2018-01-24', 'SA_REP', 7200.00, 0.10, 147, 80),
(165, 'David', 'Lee', 'DLEE', '1.011.555.0150', '2018-02-23', 'SA_REP', 6800.00, 0.10, 147, 80),
(166, 'Sundar', 'Ande', 'SANDE', '1.011.555.0151', '2018-03-24', 'SA_REP', 6400.00, 0.10, 147, 80),
(167, 'Amit', 'Banda', 'ABANDA', '1.011.555.0152', '2018-04-21', 'SA_REP', 6200.00, 0.10, 147, 80),
(168, 'Lisa', 'Ozer', 'LOZER', '1.011.555.0148', '2015-03-11', 'SA_REP', 11500.00, 0.25, 148, 80),
(169, 'Harrison', 'Bloom', 'HBLOOM', '1.011.555.0149', '2016-03-23', 'SA_REP', 10000.00, 0.20, 148, 80),
(170, 'Tayler', 'Fox', 'TFOX', '1.011.555.0150', '2016-01-24', 'SA_REP', 9600.00, 0.20, 148, 80),
(171, 'William', 'Smith', 'WSMITH', '1.011.555.0151', '2017-02-23', 'SA_REP', 7400.00, 0.15, 148, 80),
(172, 'Elizabeth', 'Bates', 'EBATES', '1.011.555.0152', '2017-03-24', 'SA_REP', 7300.00, 0.15, 148, 80),
(173, 'Sundita', 'Kumar', 'SKUMAR', '1.011.555.0153', '2018-04-21', 'SA_REP', 6100.00, 0.10, 148, 80),
(174, 'Ellen', 'Abel', 'EABEL', '1.011.555.0149', '2014-05-11', 'SA_REP', 11000.00, 0.30, 149, 80),
(175, 'Alyssa', 'Hutton', 'AHUTTON', '1.011.555.0150', '2015-03-19', 'SA_REP', 8800.00, 0.25, 149, 80),
(176, 'Jonathon', 'Taylor', 'JTAYLOR', '1.011.555.0151', '2016-03-24', 'SA_REP', 8600.00, 0.20, 149, 80),
(177, 'Jack', 'Livingston', 'JLIVINGS', '1.011.555.0152', '2016-04-23', 'SA_REP', 8400.00, 0.20, 149, 80),
(178, 'Kimberely', 'Grant', 'KGRANT', '1.011.555.0153', '2017-05-24', 'SA_REP', 7000.00, 0.15, 149, NULL),
(179, 'Charles', 'Johnson', 'CJOHNSON', '1.011.555.0154', '2018-01-04', 'SA_REP', 6200.00, 0.10, 149, 80),
(180, 'Winston', 'Taylor', 'WTAYLOR', '1.650.555.0145', '2016-01-24', 'SH_CLERK', 3200.00, NULL, 120, 50),
(181, 'Jean', 'Fleaur', 'JFLEAUR', '1.650.555.0146', '2016-02-23', 'SH_CLERK', 3100.00, NULL, 120, 50),
(182, 'Martha', 'Sullivan', 'MSULLIVA', '1.650.555.0147', '2017-06-21', 'SH_CLERK', 2500.00, NULL, 120, 50),
(183, 'Girard', 'Geoni', 'GGEONI', '1.650.555.0148', '2018-02-03', 'SH_CLERK', 2800.00, NULL, 120, 50),
(184, 'Nandita', 'Sarchand', 'NSARCHAN', '1.650.555.0149', '2014-01-27', 'SH_CLERK', 4200.00, NULL, 121, 50),
(185, 'Alexis', 'Bull', 'ABULL', '1.650.555.0150', '2015-02-20', 'SH_CLERK', 4100.00, NULL, 121, 50),
(186, 'Julia', 'Dellinger', 'JDELLING', '1.650.555.0151', '2016-06-24', 'SH_CLERK', 3400.00, NULL, 121, 50),
(187, 'Anthony', 'Cabrio', 'ACABRIO', '1.650.555.0152', '2017-02-07', 'SH_CLERK', 3000.00, NULL, 121, 50),
(188, 'Kelly', 'Chung', 'KCHUNG', '1.650.555.0153', '2015-06-14', 'SH_CLERK', 3800.00, NULL, 122, 50),
(189, 'Jennifer', 'Dilly', 'JDILLY', '1.650.555.0154', '2015-08-13', 'SH_CLERK', 3600.00, NULL, 122, 50),
(190, 'Timothy', 'Venzl', 'TVENZL', '1.650.555.0155', '2016-07-11', 'SH_CLERK', 2900.00, NULL, 122, 50),
(191, 'Randall', 'Perkins', 'RPERKINS', '1.650.555.0156', '2017-12-19', 'SH_CLERK', 2500.00, NULL, 122, 50),
(192, 'Sarah', 'Bell', 'SBELL', '1.650.555.0157', '2014-02-04', 'SH_CLERK', 4000.00, NULL, 123, 50),
(193, 'Britney', 'Everett', 'BEVERETT', '1.650.555.0158', '2015-03-03', 'SH_CLERK', 3900.00, NULL, 123, 50),
(194, 'Samuel', 'McLeod', 'SMCLEOD', '1.650.555.0159', '2016-07-01', 'SH_CLERK', 3200.00, NULL, 123, 50),
(195, 'Vance', 'Jones', 'VJONES', '1.650.555.0160', '2017-03-17', 'SH_CLERK', 2800.00, NULL, 123, 50),
(196, 'Alana', 'Walsh', 'AWALSH', '1.650.555.0161', '2016-04-24', 'SH_CLERK', 3100.00, NULL, 124, 50),
(197, 'Kevin', 'Feeney', 'KFEENEY', '1.650.555.0162', '2016-05-23', 'SH_CLERK', 3000.00, NULL, 124, 50),
(198, 'Donald', 'OConnell', 'DOCONNEL', '1.650.555.0163', '2017-06-21', 'SH_CLERK', 2600.00, NULL, 124, 50),
(199, 'Douglas', 'Grant', 'DGRANT', '1.650.555.0164', '2018-01-13', 'SH_CLERK', 2600.00, NULL, 124, 50),
(200, 'Jennifer', 'Whalen', 'JWHALEN', '1.515.555.0165', '2013-09-17', 'AD_ASST', 4400.00, NULL, 101, 10),
(201, 'Michael', 'Martinez', 'MMARTINE', '1.515.555.0166', '2014-02-17', 'MK_MAN', 13000.00, NULL, 100, 20),
(202, 'Pat', 'Davis', 'PDAVIS', '1.603.555.0167', '2015-08-17', 'MK_REP', 6000.00, NULL, 201, 20),
(203, 'Susan', 'Jacobs', 'SJACOBS', '1.515.555.0168', '2012-06-07', 'HR_REP', 6500.00, NULL, 101, 40),
(204, 'Hermann', 'Brown', 'HBROWN', '1.515.555.0169', '2012-06-07', 'PR_REP', 10000.00, NULL, 101, 70),
(205, 'Shelley', 'Higgins', 'SHIGGINS', '1.515.555.0170', '2012-06-07', 'AC_MGR', 12008.00, NULL, 101, 110),
(206, 'William', 'Gietz', 'WGIETZ', '1.515.555.0171', '2012-06-07', 'AC_ACCOUNT', 8300.00, NULL, 205, 110);

-- ============================================================================
-- Update DEPARTMENTS with manager_id values
-- ============================================================================
UPDATE departments SET manager_id = 200 WHERE department_id = 10;
UPDATE departments SET manager_id = 201 WHERE department_id = 20;
UPDATE departments SET manager_id = 114 WHERE department_id = 30;
UPDATE departments SET manager_id = 203 WHERE department_id = 40;
UPDATE departments SET manager_id = 121 WHERE department_id = 50;
UPDATE departments SET manager_id = 103 WHERE department_id = 60;
UPDATE departments SET manager_id = 204 WHERE department_id = 70;
UPDATE departments SET manager_id = 145 WHERE department_id = 80;
UPDATE departments SET manager_id = 100 WHERE department_id = 90;
UPDATE departments SET manager_id = 108 WHERE department_id = 100;
UPDATE departments SET manager_id = 205 WHERE department_id = 110;

-- ============================================================================
-- Table: JOB_HISTORY (10 rows)
-- ============================================================================
INSERT INTO job_history (employee_id, start_date, end_date, job_id, department_id) VALUES
(101, '2007-09-21', '2011-10-27', 'AC_ACCOUNT', 110),
(101, '2011-10-28', '2015-03-15', 'AC_MGR', 110),
(102, '2011-01-13', '2016-07-24', 'IT_PROG', 60),
(114, '2016-03-24', '2017-12-31', 'ST_CLERK', 50),
(122, '2017-01-01', '2017-12-31', 'ST_CLERK', 50),
(176, '2016-03-24', '2016-12-31', 'SA_REP', 80),
(176, '2017-01-01', '2017-12-31', 'SA_MAN', 80),
(200, '2005-09-17', '2011-06-17', 'AD_ASST', 90),
(200, '2012-07-01', '2016-12-31', 'AC_ACCOUNT', 90),
(201, '2014-02-17', '2017-12-19', 'MK_REP', 20);

-- Re-enable triggers
SET session_replication_role = 'origin';

-- ============================================================================
-- Verify row counts
-- ============================================================================
SELECT 'regions' as table_name, COUNT(*) as row_count FROM regions
UNION ALL
SELECT 'countries', COUNT(*) FROM countries
UNION ALL
SELECT 'locations', COUNT(*) FROM locations
UNION ALL
SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL
SELECT 'departments', COUNT(*) FROM departments
UNION ALL
SELECT 'employees', COUNT(*) FROM employees
UNION ALL
SELECT 'job_history', COUNT(*) FROM job_history
ORDER BY table_name;

-- ============================================================================
-- End of data insert script
-- Total rows inserted: 218
-- ============================================================================
