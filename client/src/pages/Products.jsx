import { useEffect, useMemo, useRef, useState } from 'react';
import api, { errMsg } from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import LeafRating from '../components/LeafRating';
import { PRODUCT_CRITERIA, criterionLabel } from '../lib/stages';

// שורת הקריטריונים: "כללי" תמיד ראשון, אחריו שאר הקריטריונים
const ORDERED_CRITERIA = [
  ...PRODUCT_CRITERIA.filter((c) => c.key === 'overall'),
  ...PRODUCT_CRITERIA.filter((c) => c.key !== 'overall')
];

function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) {
    return <div className="product-img-fallback" aria-hidden="true">🌿</div>;
  }
  return (
    <img
      className="product-img"
      src={src}
      alt={alt || ''}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function Products() {
  const { t, language } = useTranslation();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  // מצב שמירה לכל מוצר+קריטריון: 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState({});
  const saveTimers = useRef({});
  const debounceRef = useRef(null);

  const fetchProducts = (withSpinner = true) => {
    if (withSpinner) setLoading(true);
    return api.get('/products', { params: { query, category } })
      .then((r) => {
        setProducts(r.data?.products || []);
        setCategories(r.data?.categories || []);
        setError('');
      })
      .catch((err) => setError(errMsg(err, t('products.load_error'))))
      .finally(() => { if (withSpinner) setLoading(false); });
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProducts(true), query ? 300 : 0);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category]);

  useEffect(() => () => {
    Object.values(saveTimers.current).forEach(clearTimeout);
  }, []);

  const productName = (p) => (language === 'he'
    ? (p.name_he || p.name_en)
    : (p.name_en || p.name_he)) || '';

  const rate = async (productId, criterion, value) => {
    const key = `${productId}:${criterion}`;
    setSaveState((s) => ({ ...s, [key]: 'saving' }));
    // עדכון אופטימי של הדירוג שלי
    setProducts((list) => list.map((p) => (p.id === productId
      ? { ...p, my_ratings: { ...(p.my_ratings || {}), [criterion]: value } }
      : p)));
    try {
      await api.post(`/products/${productId}/rate`, { ratings: { [criterion]: value } });
      setSaveState((s) => ({ ...s, [key]: 'saved' }));
      clearTimeout(saveTimers.current[key]);
      saveTimers.current[key] = setTimeout(() => {
        setSaveState((s) => {
          const next = { ...s };
          delete next[key];
          return next;
        });
      }, 2000);
      // רענון שקט של הממוצעים הקהילתיים
      fetchProducts(false);
    } catch (err) {
      setSaveState((s) => ({ ...s, [key]: 'error' }));
      setError(errMsg(err, t('products.save_error')));
    }
  };

  const visibleCategories = useMemo(
    () => (categories || []).filter(Boolean),
    [categories]
  );

  return (
    <main className="page">
      <h1 className="page-title">{t('products.title')}</h1>
      <p className="page-subtitle">{t('products.subtitle')}</p>

      <div className="product-toolbar">
        <div className="field product-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('products.search_placeholder')}
            aria-label={t('products.search_placeholder')}
          />
        </div>
        <div className="product-cat-chips" role="tablist">
          <button
            type="button"
            className={`product-cat-chip ${category === '' ? 'active' : ''}`}
            onClick={() => setCategory('')}
          >
            {t('products.all_categories')}
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`product-cat-chip ${category === cat ? 'active' : ''}`}
              onClick={() => setCategory(cat === category ? '' : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <div className="product-empty">{t('common.loading')}</div>
      ) : products.length === 0 ? (
        <div className="product-empty">{t('products.empty')}</div>
      ) : (
        <div className="product-grid">
          {products.map((p) => {
            const expanded = expandedId === p.id;
            return (
              <article key={p.id} className={`card product-card ${expanded ? 'expanded' : ''}`}>
                <button
                  type="button"
                  className="product-card-head"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                  aria-expanded={expanded}
                >
                  <ProductImage src={p.image_url} alt={productName(p)} />
                  <div className="product-card-info">
                    <div className="product-name-row">
                      <strong className="product-name">{productName(p)}</strong>
                      {p.category && <span className="product-cat-tag">{p.category}</span>}
                    </div>
                    {p.brand && <div className="product-brand">{p.brand}</div>}
                    <div className="product-meta">
                      {p.thc_percent != null && (
                        <span>{t('products.thc')} {p.thc_percent}%</span>
                      )}
                      {p.cbd_percent != null && (
                        <span>{t('products.cbd')} {p.cbd_percent}%</span>
                      )}
                      {p.form && <span>{p.form}</span>}
                    </div>
                    {p.terpenes && (
                      <div className="product-terpenes">{t('products.terpenes')}: {p.terpenes}</div>
                    )}
                  </div>
                  <span className="product-expand-hint">{expanded ? '▴' : '▾'}</span>
                </button>

                {expanded && (
                  <div className="product-rating-rows">
                    {ORDERED_CRITERIA.map((c) => {
                      const key = `${p.id}:${c.key}`;
                      const state = saveState[key];
                      const agg = p.avg_ratings?.[c.key];
                      return (
                        <div key={c.key} className={`rating-row ${c.key === 'overall' ? 'rating-row-overall' : ''}`}>
                          <span className="rating-row-label">{criterionLabel(c.key, language)}</span>
                          <LeafRating
                            value={p.my_ratings?.[c.key] || 0}
                            onChange={(v) => rate(p.id, c.key, v)}
                            size={22}
                          />
                          <span className="rating-row-avg">
                            {agg?.count
                              ? t('products.avg_line', {
                                  avg: Number(agg.avg).toFixed(1),
                                  count: agg.count
                                })
                              : t('products.no_ratings')}
                          </span>
                          <span className={`rating-saved ${state || ''}`}>
                            {state === 'saving' && '…'}
                            {state === 'saved' && `✓ ${t('products.saved')}`}
                            {state === 'error' && '✗'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
