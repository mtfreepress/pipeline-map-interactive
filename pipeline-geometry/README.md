# Bridger route source

`BridgerShapefile_20260326.shp` and its companion files are the supplied source data. The map reads the converted `public/data/pipeline.geojson`; it does not load the shapefile in the browser.

- Source CRS: NAD83 / BLM 13N (US survey feet), EPSG:4433, as specified by the `.prj` file.
- Output: WGS84 longitude/latitude GeoJSON, EPSG:4326 / RFC 7946.
- One LineString with all 1,035 source vertices retained, rounded to seven decimal places. No simplification.
- Original `Updated` and `Shape_Leng` attributes are preserved. `Shape_Leng` remains in the original source units, not degrees or kilometers.
- The accompanying XML describes a project centerline for agency review. The filename and attributes are retained as provided; no independent route-status verification is implied.

The conversion uses one consistent operation across the route: inverse BLM zone 13N followed by NAD83 to WGS84 (1). Local PROJ reports this operation as applicable to the entire route extent, with nominal 4-meter accuracy. Specifying it avoids GDAL automatically switching coordinate operations between portions of the line. Decimal precision in the export does not increase the accuracy of the source.

To regenerate with GDAL installed, run from the repository root:

```sh
route_work_dir=$(mktemp -d)
ogr2ogr -f GeoJSON -t_srs EPSG:4326 \
  -ct '+proj=pipeline +step +proj=unitconvert +xy_in=us-ft +xy_out=m +step +inv +proj=tmerc +lat_0=0 +lon_0=-105 +k=0.9996 +x_0=500000.001016002 +y_0=0 +ellps=GRS80 +step +proj=unitconvert +xy_in=rad +xy_out=deg +step +proj=axisswap +order=2,1' \
  -lco RFC7946=YES -lco COORDINATE_PRECISION=7 \
  "$route_work_dir/pipeline.geojson" \
  pipeline-geometry/BridgerShapefile_20260326.shp &&
mv "$route_work_dir/pipeline.geojson" public/data/pipeline.geojson
rmdir "$route_work_dir"
```

GDAL is only needed when converting source data, not to install, develop, build or serve the app. The original shapefile is unchanged. The four demo points in `public/data/people.geojson` are placed at approximately 86%, 62%, 38% and 12% of the route's length, measured from its southern end; they remain demo locations.
